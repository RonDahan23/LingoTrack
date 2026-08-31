import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { decryptSecret } from '../src/lib/crypto.js';
import { createOAuthState } from '../src/services/spotify/oauth.js';
import { getSyncState } from '../src/services/syncService.js';
import { verifySessionToken } from '../src/services/sessionService.js';

/**
 * Exercises the full Step 2 flow against the real database with Spotify
 * stubbed: callback -> token exchange -> user upsert -> background sync ->
 * Track / UserTrackProgress rows.
 *
 * Requires a reachable DATABASE_URL. Rows are namespaced by TEST_SPOTIFY_ID
 * and removed in afterAll.
 */

const TEST_SPOTIFY_ID = 'itest-spotify-user';
const TEST_TRACK_IDS = ['itest_track_a', 'itest_track_b'];

let server: Server;
let baseUrl: string;

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubTrack(id: string, name: string, artist: string) {
  return {
    added_at: '2026-01-01T00:00:00Z',
    track: {
      id,
      name,
      duration_ms: 210_000,
      artists: [{ name: artist }],
      album: { images: [{ url: `https://img.example/${id}.jpg`, width: 640, height: 640 }] },
    },
  };
}

beforeAll(async () => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    // Requests to our own test server must go through untouched.
    if (url.includes('127.0.0.1')) return realFetch(input, init);

    if (url === 'https://accounts.spotify.com/api/token') {
      return jsonResponse({
        access_token: 'stub-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'stub-refresh-token',
      });
    }

    if (url === 'https://api.spotify.com/v1/me') {
      return jsonResponse({
        id: TEST_SPOTIFY_ID,
        email: 'itest@example.com',
        display_name: 'Integration Test',
      });
    }

    if (url.startsWith('https://api.spotify.com/v1/me/tracks')) {
      // Two pages, to prove cursor-following works.
      if (url.includes('offset=0')) {
        return jsonResponse({
          items: [
            stubTrack(TEST_TRACK_IDS[0] as string, 'First Song', 'Artist One'),
            // A local file: null id, must be skipped rather than crashing.
            { added_at: '2026-01-01T00:00:00Z', track: null },
          ],
          next: 'https://api.spotify.com/v1/me/tracks?limit=50&offset=50',
          total: 2,
        });
      }
      return jsonResponse({
        items: [stubTrack(TEST_TRACK_IDS[1] as string, 'Second Song', 'Artist Two')],
        next: null,
        total: 2,
      });
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  });

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { spotifyId: TEST_SPOTIFY_ID } });
  if (user) {
    await prisma.userTrackProgress.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.track.deleteMany({ where: { id: { in: TEST_TRACK_IDS } } });

  vi.unstubAllGlobals();
  server.close();
  await prisma.$disconnect();
});

async function waitForSync(userId: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (getSyncState(userId).status !== 'running') return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('sync did not finish in time');
}

describe('OAuth callback -> library sync', () => {
  let userId: string;
  let sessionToken: string;

  it('exchanges the code, creates the user, and redirects with a session token', async () => {
    const state = createOAuthState();
    const res = await fetch(`${baseUrl}/api/auth/callback?code=stub-code&state=${state}`, {
      redirect: 'manual',
    });

    expect(res.status).toBe(302);

    // Redirects back to the web app origin with the token in the URL.
    const location = new URL(res.headers.get('location') as string);
    expect(location.origin).toBe('http://localhost:5199');

    sessionToken = location.searchParams.get('token') as string;
    const verified = verifySessionToken(sessionToken);
    expect(verified).toBeTruthy();
    userId = verified as string;
  });

  it('stores Spotify tokens encrypted, not in plaintext', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    expect(user.email).toBe('itest@example.com');
    expect(user.accessToken).not.toBe('stub-access-token');
    expect(user.refreshToken).not.toBe('stub-refresh-token');
    expect(user.accessToken.startsWith('v1.')).toBe(true);

    // ...but round-trips back to the original values.
    expect(decryptSecret(user.accessToken)).toBe('stub-access-token');
    expect(decryptSecret(user.refreshToken)).toBe('stub-refresh-token');
    expect(user.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('ingests both pages, skipping the null-id local file', async () => {
    await waitForSync(userId);

    const state = getSyncState(userId);
    expect(state.status).toBe('succeeded');
    if (state.status !== 'succeeded') throw new Error('unreachable');

    expect(state.result.pagesFetched).toBe(2);
    expect(state.result.tracksSeen).toBe(2);
    expect(state.result.tracksSkipped).toBe(1);
    expect(state.result.linksCreated).toBe(2);
  });

  it('writes tracks as UNGRADED so they stay out of the ranked tabs', async () => {
    const tracks = await prisma.track.findMany({
      where: { id: { in: TEST_TRACK_IDS } },
      orderBy: { id: 'asc' },
    });

    expect(tracks).toHaveLength(2);
    expect(tracks[0]?.title).toBe('First Song');
    expect(tracks[0]?.artist).toBe('Artist One');
    expect(tracks[0]?.albumArtUrl).toBe('https://img.example/itest_track_a.jpg');

    for (const track of tracks) {
      expect(track.difficultyLevel).toBe('UNGRADED');
      expect(track.difficultyScore).toBe(0);
      expect(track.lyricsSynced).toBe(false);
    }
  });

  it('links the tracks to the user', async () => {
    const links = await prisma.userTrackProgress.findMany({ where: { userId } });
    expect(links).toHaveLength(2);
    expect(links.every((l) => l.masteredPct === 0)).toBe(true);
  });

  it('serves the authenticated status endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/sync/status`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ trackCount: 2, ungradedCount: 2 });
  });

  it('is idempotent: a second sync creates no duplicate links', async () => {
    const res = await fetch(`${baseUrl}/api/sync/liked-tracks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(res.status).toBe(202);

    await waitForSync(userId);

    const state = getSyncState(userId);
    if (state.status !== 'succeeded') throw new Error('second sync did not succeed');
    expect(state.result.linksCreated).toBe(0);

    expect(await prisma.userTrackProgress.count({ where: { userId } })).toBe(2);
    expect(await prisma.track.count({ where: { id: { in: TEST_TRACK_IDS } } })).toBe(2);
  });

  it('does not clobber a difficulty score computed by Step 3', async () => {
    const trackId = TEST_TRACK_IDS[0] as string;
    await prisma.track.update({
      where: { id: trackId },
      data: { difficultyLevel: 'ADVANCED', difficultyScore: 8.4, lyricsSynced: true },
    });

    const res = await fetch(`${baseUrl}/api/sync/liked-tracks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    expect(res.status).toBe(202);
    await waitForSync(userId);

    const track = await prisma.track.findUniqueOrThrow({ where: { id: trackId } });
    expect(track.difficultyLevel).toBe('ADVANCED');
    expect(track.difficultyScore).toBeCloseTo(8.4, 5);
    expect(track.lyricsSynced).toBe(true);
  });
});
