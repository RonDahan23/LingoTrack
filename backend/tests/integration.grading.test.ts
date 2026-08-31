import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { issueSessionToken } from '../src/services/sessionService.js';
import { encryptSecret } from '../src/lib/crypto.js';

/**
 * Step 3 end to end against the real database: seed a user with two liked
 * tracks, POST LRC lyrics to ingest+grade each, then read /api/tracks/ranked
 * and assert the tracks land in the right tabs. Rows are namespaced and removed
 * in afterAll.
 */

const SPOTIFY_ID = 'itest-grading-user';
const EASY_ID = 'itest_grade_easy';
const HARD_ID = 'itest_grade_hard';
const UNGRADED_ID = 'itest_grade_ungraded';

let server: Server;
let baseUrl: string;
let userId: string;
let auth: { Authorization: string };

const EASY_LRC = [
  '[ar:Test]',
  '[00:10.00]I love you and you love me',
  '[00:14.00]we are so happy here today',
  '[00:18.00]hold my hand and never go',
  '[00:22.00]I love you and you love me',
].join('\n');

const HARD_LRC = [
  '[00:01.00]perspicacious labyrinths have swallowed my clandestine catharsis tonight',
  '[00:03.50]notorious requiems were unravelling sublime paradoxes beneath oblivion',
  '[00:06.00]immutable serenity has been betrayed by pernicious cacophony again',
  '[00:08.50]nostalgia devoured euphoria while grandiloquent melancholy lingered restlessly',
  '[00:11.00]irrevocable nuance haunts these quintessential idiosyncratic disillusioned sonnets',
  '[00:13.50]venomous eclipse reconciled the ephemeral mirage of shattered reason',
  '[00:16.00]insatiable delusion transcends this labyrinthine paradox of sorrow',
  '[00:18.50]clandestine embers smoulder where notorious ecstasy surrendered slowly',
].join('\n');

async function seedTrack(id: string, durationMs: number | null) {
  await prisma.track.create({
    data: {
      id,
      title: id,
      artist: 'Test Artist',
      durationMs,
      previewUrl: `https://preview.example/${id}.mp3`,
      difficultyLevel: 'UNGRADED',
      difficultyScore: 0,
      lyricsSynced: false,
    },
  });
  await prisma.userTrackProgress.create({ data: { userId, trackId: id } });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      spotifyId: SPOTIFY_ID,
      email: 'grading@example.com',
      accessToken: encryptSecret('x'),
      refreshToken: encryptSecret('y'),
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  userId = user.id;
  auth = { Authorization: `Bearer ${issueSessionToken(userId)}` };

  await seedTrack(EASY_ID, 240_000);
  await seedTrack(HARD_ID, 21_000);
  await seedTrack(UNGRADED_ID, 200_000);

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await prisma.userTrackProgress.deleteMany({ where: { userId } });
  await prisma.lyricLine.deleteMany({ where: { trackId: { in: [EASY_ID, HARD_ID, UNGRADED_ID] } } });
  await prisma.track.deleteMany({ where: { id: { in: [EASY_ID, HARD_ID, UNGRADED_ID] } } });
  await prisma.user.delete({ where: { id: userId } });
  server.close();
  await prisma.$disconnect();
});

describe('lyrics ingestion + grading', () => {
  it('ingests LRC into timed LyricLine rows and grades the easy track BEGINNER', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/${EASY_ID}/lyrics`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lrc: EASY_LRC }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { lineCount: number; grade: { level: string } };
    expect(body.lineCount).toBe(4);
    expect(body.grade.level).toBe('BEGINNER');

    const lines = await prisma.lyricLine.findMany({
      where: { trackId: EASY_ID },
      orderBy: { lineNumber: 'asc' },
    });
    expect(lines).toHaveLength(4);
    expect(lines[0]?.startTime).toBe(10_000);
    expect(lines[0]?.endTime).toBe(14_000); // next line's start
    expect(lines[3]?.endTime).toBe(240_000); // bounded by duration

    const track = await prisma.track.findUniqueOrThrow({ where: { id: EASY_ID } });
    expect(track.lyricsSynced).toBe(true);
    expect(track.difficultyLevel).toBe('BEGINNER');
  });

  it('grades the dense, fast track ADVANCED', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/${HARD_ID}/lyrics`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lrc: HARD_LRC }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).grade.level).toBe('ADVANCED');
  });

  it('replaces lyrics on re-ingest rather than appending', async () => {
    await fetch(`${baseUrl}/api/tracks/${EASY_ID}/lyrics`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lrc: EASY_LRC }),
    });
    expect(await prisma.lyricLine.count({ where: { trackId: EASY_ID } })).toBe(4);
  });

  it('rejects ingesting lyrics for a track not in the library', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/not-mine/lyrics`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lrc: EASY_LRC }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/tracks/ranked', () => {
  it('groups graded tracks into tabs and omits ungraded ones', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/ranked`, { headers: auth });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      levels: Record<string, { count: number; tracks: Array<{ id: string }> }>;
    };

    expect(body.levels.BEGINNER.tracks.map((t) => t.id)).toContain(EASY_ID);
    expect(body.levels.ADVANCED.tracks.map((t) => t.id)).toContain(HARD_ID);

    // The ungraded track appears in no tab.
    const allIds = Object.values(body.levels).flatMap((g) => g.tracks.map((t) => t.id));
    expect(allIds).not.toContain(UNGRADED_ID);
  });

  it('narrows to a single bucket with ?level=', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/ranked?level=ADVANCED`, { headers: auth });
    const body = (await res.json()) as {
      levels: Record<string, { tracks: Array<{ id: string }> }>;
    };
    expect(body.levels.ADVANCED.tracks.map((t) => t.id)).toContain(HARD_ID);
    expect(body.levels.BEGINNER.tracks).toHaveLength(0);
  });

  it('rejects an unknown ?level=', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/ranked?level=EXPERT`, { headers: auth });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/ranked`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/tracks/:trackId', () => {
  it('returns the track with preview URL and ordered lyric lines', async () => {
    // EASY_ID had lyrics ingested earlier in this file.
    const res = await fetch(`${baseUrl}/api/tracks/${EASY_ID}`, { headers: auth });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      track: { id: string; previewUrl: string | null; lyricsSynced: boolean; masteredPct: number };
      lyrics: Array<{ text: string; startTime: number; endTime: number; lineNumber: number }>;
    };

    expect(body.track.id).toBe(EASY_ID);
    expect(body.track.previewUrl).toBe(`https://preview.example/${EASY_ID}.mp3`);
    expect(body.track.lyricsSynced).toBe(true);
    expect(body.lyrics).toHaveLength(4);
    expect(body.lyrics[0]?.lineNumber).toBe(1);
    expect(body.lyrics[0]?.startTime).toBe(10_000);
    // Lines come back ordered.
    const lineNumbers = body.lyrics.map((l) => l.lineNumber);
    expect(lineNumbers).toEqual([...lineNumbers].sort((a, b) => a - b));
  });

  it('returns an empty lyrics array for an ungraded track with no lyrics', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/${UNGRADED_ID}`, { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lyrics: unknown[] };
    expect(body.lyrics).toHaveLength(0);
  });

  it('404s for a track not in the library', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/not-mine`, { headers: auth });
    expect(res.status).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/${EASY_ID}`);
    expect(res.status).toBe(401);
  });
});
