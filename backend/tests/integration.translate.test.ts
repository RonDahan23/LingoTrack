import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { issueSessionToken } from '../src/services/sessionService.js';
import { encryptSecret } from '../src/lib/crypto.js';

/**
 * Exercises /api/translate against the real DB with MyMemory stubbed, and
 * verifies the cache: a second identical request must NOT hit the API again.
 */

const SPOTIFY_ID = 'itest-translate-user';
const SOURCE = 'hello world';

let server: Server;
let baseUrl: string;
let auth: { Authorization: string };
let apiCalls = 0;

const realFetch = globalThis.fetch;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      spotifyId: SPOTIFY_ID,
      email: 'translate@example.com',
      accessToken: encryptSecret('x'),
      refreshToken: encryptSecret('y'),
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  auth = { Authorization: `Bearer ${issueSessionToken(user.id)}` };

  await prisma.translation.deleteMany({ where: { source: SOURCE, target: 'he' } });

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('127.0.0.1')) return realFetch(input, init);
    if (url.includes('api.mymemory.translated.net')) {
      apiCalls++;
      return new Response(
        JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'שלום עולם' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await prisma.translation.deleteMany({ where: { source: SOURCE, target: 'he' } });
  await prisma.user.deleteMany({ where: { spotifyId: SPOTIFY_ID } });
  vi.unstubAllGlobals();
  server.close();
  await prisma.$disconnect();
});

describe('GET /api/translate', () => {
  it('requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/translate?text=hi`);
    expect(res.status).toBe(401);
  });

  it('rejects a missing text param', async () => {
    const res = await fetch(`${baseUrl}/api/translate`, { headers: auth });
    expect(res.status).toBe(400);
  });

  it('translates to Hebrew, then serves the second call from cache', async () => {
    const before = apiCalls;

    const first = await fetch(`${baseUrl}/api/translate?text=${encodeURIComponent(SOURCE)}`, {
      headers: auth,
    });
    expect(first.status).toBe(200);
    expect((await first.json()).translation).toBe('שלום עולם');
    expect(apiCalls).toBe(before + 1);

    // Same text (different casing/spacing normalises to the same key) → cached.
    const second = await fetch(`${baseUrl}/api/translate?text=${encodeURIComponent('Hello   World')}`, {
      headers: auth,
    });
    expect((await second.json()).translation).toBe('שלום עולם');
    expect(apiCalls).toBe(before + 1); // no new API call
  });
});
