import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { issueSessionToken } from '../src/services/sessionService.js';
import { encryptSecret } from '../src/lib/crypto.js';

/**
 * Exercises the word bank + practice endpoints against the real DB, with
 * MyMemory stubbed. Covers the two behaviours that are easy to regress:
 *   - capture is keyed on the LEMMA, so "climbing" then "climbed" is one entry;
 *   - submitting a review advances the SRS schedule rather than resetting it.
 */

const SPOTIFY_ID = 'itest-wordbank-user';
const TRACK_ID = 'itest_wordbank_track';

let server: Server;
let baseUrl: string;
let auth: { Authorization: string };
let userId: string;

const realFetch = globalThis.fetch;

/** Deterministic fake Hebrew so option lists stay distinct per source word. */
function fakeHebrew(source: string): string {
  return `he:${source}`;
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...auth, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      spotifyId: SPOTIFY_ID,
      email: 'wordbank@example.com',
      accessToken: encryptSecret('x'),
      refreshToken: encryptSecret('y'),
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  userId = user.id;
  auth = { Authorization: `Bearer ${issueSessionToken(user.id)}` };

  await prisma.track.upsert({
    where: { id: TRACK_ID },
    update: {},
    create: {
      id: TRACK_ID,
      title: 'Test Song',
      artist: 'Test Artist',
      difficultyLevel: 'BEGINNER',
      difficultyScore: 1,
    },
  });
  await prisma.userTrackProgress.upsert({
    where: { userId_trackId: { userId, trackId: TRACK_ID } },
    update: {},
    create: { userId, trackId: TRACK_ID },
  });

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('127.0.0.1')) return realFetch(input, init);
    if (url.includes('api.mymemory.translated.net')) {
      const source = new URL(url).searchParams.get('q') ?? '';
      return new Response(
        JSON.stringify({ responseStatus: 200, responseData: { translatedText: fakeHebrew(source) } }),
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
  // FK order: reviews -> words -> progress -> track -> user.
  const words = await prisma.userWordBank.findMany({ where: { userId }, select: { id: true } });
  await prisma.wordReview.deleteMany({ where: { wordId: { in: words.map((w) => w.id) } } });
  await prisma.userWordBank.deleteMany({ where: { userId } });
  await prisma.userTrackProgress.deleteMany({ where: { userId } });
  await prisma.track.deleteMany({ where: { id: TRACK_ID } });
  await prisma.translation.deleteMany({ where: { target: 'he', source: { startsWith: 'climb' } } });
  await prisma.user.delete({ where: { id: userId } });
  vi.unstubAllGlobals();
  server.close();
  await prisma.$disconnect();
});

describe('POST /api/words', () => {
  it('captures a word with its enriched word family', async () => {
    const res = await api('/api/words', {
      method: 'POST',
      body: JSON.stringify({
        word: 'climbing',
        contextLine: 'I keep climbing higher',
        trackId: TRACK_ID,
      }),
    });
    expect(res.status).toBe(201);

    const { word } = (await res.json()) as {
      word: { lemma: string; word: string; partOfSpeech: string; forms: { form: string }[] };
    };
    expect(word.word).toBe('climbing');
    expect(word.lemma).toBe('climb');
    expect(word.partOfSpeech).toBe('VERB');
    expect(word.forms.map((f) => f.form)).toEqual(
      expect.arrayContaining(['climb', 'to climb', 'climbing', 'climbed']),
    );
  });

  it('folds another form of the same word into the SAME entry', async () => {
    const before = await prisma.userWordBank.count({ where: { userId } });
    const res = await api('/api/words', {
      method: 'POST',
      body: JSON.stringify({ word: 'climbed', contextLine: 'I climbed the wall' }),
    });
    // Already known -> 200, not 201, and no new row.
    expect(res.status).toBe(200);
    expect(await prisma.userWordBank.count({ where: { userId } })).toBe(before);

    const { word } = (await res.json()) as { word: { lemma: string; word: string } };
    expect(word.lemma).toBe('climb');
    // The originally-tapped surface form is preserved for display.
    expect(word.word).toBe('climbing');
  });

  it('rejects input containing no usable word', async () => {
    const res = await api('/api/words', { method: 'POST', body: JSON.stringify({ word: '...' }) });
    expect(res.status).toBe(422);
  });

  it('rejects a missing word', async () => {
    const res = await api('/api/words', { method: 'POST', body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/words', () => {
  it('lists saved words with stats', async () => {
    const res = await api('/api/words');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      words: { lemma: string }[];
      total: number;
      stats: { total: number; due: number };
    };
    expect(body.words.some((w) => w.lemma === 'climb')).toBe(true);
    expect(body.stats.total).toBeGreaterThan(0);
    // A freshly captured word is due immediately.
    expect(body.stats.due).toBeGreaterThan(0);
  });

  it('rejects an unknown status filter', async () => {
    const res = await api('/api/words?status=NONSENSE');
    expect(res.status).toBe(400);
  });
});

describe('practice session and review', () => {
  it('builds a session containing the captured word', async () => {
    // A second word gives the generator distractors to work with.
    await api('/api/words', {
      method: 'POST',
      body: JSON.stringify({ word: 'shadow', contextLine: 'a shadow on the wall' }),
    });

    const res = await api('/api/practice/session');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      exercises: { wordId: string; options: string[]; answerIndex: number }[];
      dueCount: number;
    };
    expect(body.dueCount).toBeGreaterThan(0);
    expect(body.exercises.length).toBeGreaterThan(0);
    for (const exercise of body.exercises) {
      expect(exercise.options.length).toBeGreaterThan(1);
      expect(exercise.options[exercise.answerIndex]).toBeDefined();
    }
  });

  it('advances the schedule on a correct answer', async () => {
    const entry = await prisma.userWordBank.findFirstOrThrow({
      where: { userId, lemma: 'climb' },
    });

    const res = await api('/api/practice/submit', {
      method: 'POST',
      body: JSON.stringify({
        wordId: entry.id,
        exerciseType: 'MCQ_EN_TO_HE',
        correct: true,
        responseMs: 1200,
      }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      passed: boolean;
      nextIntervalDays: number;
      word: { attemptCount: number; correctCount: number };
    };
    expect(body.passed).toBe(true);
    expect(body.nextIntervalDays).toBeGreaterThan(0);
    expect(body.word.attemptCount).toBe(1);
    expect(body.word.correctCount).toBe(1);

    // The review is logged and the word is no longer due today.
    const after = await prisma.userWordBank.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.dueAt.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.wordReview.count({ where: { wordId: entry.id } })).toBe(1);
  });

  it('resets the schedule on a wrong answer', async () => {
    const entry = await prisma.userWordBank.findFirstOrThrow({
      where: { userId, lemma: 'shadow' },
    });
    const res = await api('/api/practice/submit', {
      method: 'POST',
      body: JSON.stringify({ wordId: entry.id, exerciseType: 'FILL_BLANK', correct: false }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { passed: boolean; word: { status: string } };
    expect(body.passed).toBe(false);
    expect(body.word.status).toBe('LEARNING');

    const after = await prisma.userWordBank.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.lapses).toBe(1);
    // Failed words come back immediately.
    expect(after.dueAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('404s when submitting a review for someone else’s word', async () => {
    const res = await api('/api/practice/submit', {
      method: 'POST',
      body: JSON.stringify({
        wordId: '00000000-0000-0000-0000-000000000000',
        exerciseType: 'MCQ_EN_TO_HE',
        correct: true,
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/words/:wordId', () => {
  it('removes a word and 404s the second time', async () => {
    const entry = await prisma.userWordBank.findFirstOrThrow({
      where: { userId, lemma: 'shadow' },
    });
    expect((await api(`/api/words/${entry.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/words/${entry.id}`, { method: 'DELETE' })).status).toBe(404);
  });
});
