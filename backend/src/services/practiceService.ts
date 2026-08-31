/**
 * Practice sessions — the DB-facing half of the quiz feature.
 *
 * Decides WHICH words are due and records graded answers; the questions
 * themselves come from the pure generator (practice/quizGenerator.ts) and the
 * schedule from the pure SM-2 implementation (practice/srs.ts).
 */

import { DEFAULT_SESSION_SIZE, type ExerciseType } from '../config/wordBank.js';
import { prisma } from '../lib/prisma.js';
import { generateExercises } from './practice/quizGenerator.js';
import type { Exercise, PracticeWord } from './practice/quizGenerator.js';
import { deriveStatus, qualityFromCorrect, reviewWord } from './practice/srs.js';
import type { SrsState } from './practice/srs.js';
import { parseForms, toEntry } from './wordBankService.js';
import type { WordBankEntry } from './wordBankService.js';
import type { PartOfSpeech } from '../config/wordBank.js';

export class PracticeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PracticeError';
  }
}

/**
 * How many extra words to pull beyond the session size.
 *
 * The generator skips words it can't build an exercise for (no distractors, no
 * usable context line), so fetching exactly `limit` rows would yield short
 * sessions. Over-fetching keeps sessions full without a second round trip.
 */
const OVERFETCH = 3;

/**
 * Words available as multiple-choice distractors when the learner's own bank is
 * too small — a two-word bank otherwise can't produce a four-option question.
 * Deliberately common vocabulary so wrong answers stay plausible.
 */
const FALLBACK_DISTRACTORS: readonly { word: string; translation: string }[] = [
  { word: 'water', translation: 'מים' },
  { word: 'fire', translation: 'אש' },
  { word: 'night', translation: 'לילה' },
  { word: 'friend', translation: 'חבר' },
  { word: 'house', translation: 'בית' },
  { word: 'heart', translation: 'לב' },
  { word: 'road', translation: 'כביש' },
  { word: 'light', translation: 'אור' },
];

interface WordRow {
  id: string;
  word: string;
  lemma: string;
  translation: string;
  contextLine: string | null;
  partOfSpeech: string;
  forms: string;
}

function toPracticeWord(row: WordRow): PracticeWord {
  return {
    id: row.id,
    word: row.word,
    lemma: row.lemma,
    translation: row.translation,
    contextLine: row.contextLine,
    partOfSpeech: row.partOfSpeech as PartOfSpeech,
    forms: parseForms(row.forms),
  };
}

/**
 * Derives a stable session seed from the user and the calendar day.
 *
 * Without this, every poll of /api/practice/session would reshuffle the
 * questions mid-session. Same user + same day + same due set => same session,
 * while tomorrow's session looks different.
 */
export function sessionSeed(userId: string, now: Date = new Date()): number {
  const day = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
  let hash = day;
  for (let i = 0; i < userId.length; i++) {
    hash = (Math.imul(hash, 31) + userId.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export interface SessionOptions {
  limit?: number;
  seed?: number;
  now?: Date;
}

export interface PracticeSession {
  exercises: Exercise[];
  /** Words due at request time, regardless of how many became exercises. */
  dueCount: number;
}

/**
 * Builds a practice session from the caller's due words.
 *
 * Falls back to the least-recently-reviewed words when nothing is strictly due,
 * so "Practice" is never a dead end — a learner who wants extra reps gets them,
 * they just don't count as scheduled reviews.
 */
export async function buildSession(
  userId: string,
  options: SessionOptions = {},
): Promise<PracticeSession> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? DEFAULT_SESSION_SIZE;

  const dueCount = await prisma.userWordBank.count({
    where: { userId, dueAt: { lte: now } },
  });

  const select = {
    id: true,
    word: true,
    lemma: true,
    translation: true,
    contextLine: true,
    partOfSpeech: true,
    forms: true,
  } as const;

  let rows = await prisma.userWordBank.findMany({
    where: { userId, dueAt: { lte: now } },
    orderBy: { dueAt: 'asc' },
    take: limit + OVERFETCH,
    select,
  });

  if (rows.length === 0) {
    rows = await prisma.userWordBank.findMany({
      where: { userId },
      orderBy: [{ lastReviewedAt: 'asc' }, { createdAt: 'asc' }],
      take: limit + OVERFETCH,
      select,
    });
  }

  const words = rows.map(toPracticeWord);
  const exercises = generateExercises(words, {
    limit,
    seed: options.seed ?? sessionSeed(userId, now),
    distractorPool: FALLBACK_DISTRACTORS,
  });

  return { exercises, dueCount };
}

export interface SubmitInput {
  userId: string;
  wordId: string;
  exerciseType: ExerciseType;
  correct: boolean;
  responseMs?: number | null | undefined;
}

export interface SubmitResult {
  word: WordBankEntry;
  passed: boolean;
  /** Days until this word comes back. */
  nextIntervalDays: number;
  nextDueAt: string;
  /** True when this answer pushed the word into MASTERED. */
  justMastered: boolean;
}

/**
 * Records one graded answer and advances the word's schedule.
 *
 * The review row and the updated counters are written in a transaction so a
 * crash can't leave the log and the aggregates disagreeing.
 */
export async function submitReview(input: SubmitInput): Promise<SubmitResult> {
  const existing = await prisma.userWordBank.findFirst({
    where: { id: input.wordId, userId: input.userId },
  });
  if (!existing) {
    throw new PracticeError('Word not found in your bank');
  }

  const now = new Date();
  const quality = qualityFromCorrect(input.correct, input.responseMs);
  const current: SrsState = {
    easeFactor: existing.easeFactor,
    intervalDays: existing.intervalDays,
    repetitions: existing.repetitions,
    lapses: existing.lapses,
    status: deriveStatus(existing.repetitions, existing.intervalDays),
    dueAt: existing.dueAt,
  };
  const outcome = reviewWord(current, quality, now);

  const [, updated] = await prisma.$transaction([
    prisma.wordReview.create({
      data: {
        wordId: existing.id,
        exerciseType: input.exerciseType,
        correct: input.correct,
        quality,
        responseMs: input.responseMs ?? null,
      },
    }),
    prisma.userWordBank.update({
      where: { id: existing.id },
      data: {
        easeFactor: outcome.easeFactor,
        intervalDays: outcome.intervalDays,
        repetitions: outcome.repetitions,
        lapses: outcome.lapses,
        status: outcome.status,
        dueAt: outcome.dueAt,
        lastReviewedAt: now,
        attemptCount: { increment: 1 },
        ...(input.correct ? { correctCount: { increment: 1 } } : {}),
      },
    }),
  ]);

  return {
    word: toEntry(updated),
    passed: outcome.passed,
    nextIntervalDays: outcome.nextIntervalDays,
    nextDueAt: outcome.dueAt.toISOString(),
    justMastered: outcome.status === 'MASTERED' && existing.status !== 'MASTERED',
  };
}

export interface ReviewHistoryPoint {
  reviewedAt: string;
  correct: boolean;
  exerciseType: string;
}

/** Recent answers for one word — powers the detail view's history strip. */
export async function getWordHistory(
  userId: string,
  wordId: string,
  limit = 20,
): Promise<ReviewHistoryPoint[] | null> {
  const owned = await prisma.userWordBank.findFirst({
    where: { id: wordId, userId },
    select: { id: true },
  });
  if (!owned) return null;

  const rows = await prisma.wordReview.findMany({
    where: { wordId },
    orderBy: { reviewedAt: 'desc' },
    take: limit,
    select: { reviewedAt: true, correct: true, exerciseType: true },
  });

  return rows.map((row) => ({
    reviewedAt: row.reviewedAt.toISOString(),
    correct: row.correct,
    exerciseType: row.exerciseType,
  }));
}
