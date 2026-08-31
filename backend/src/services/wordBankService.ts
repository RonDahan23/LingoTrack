/**
 * Word-bank persistence — the only writer of UserWordBank.
 *
 * Mirrors the split used by the grading pipeline: the linguistics live in pure
 * modules (services/morphology/*), the scheduling in services/practice/srs.ts,
 * and this file does nothing but talk to the database and stitch them together.
 *
 * Capture is an UPSERT keyed on (userId, lemma), not the surface form: tapping
 * "climbing" and later "climbed" must reinforce one entry rather than fragment
 * the word family across rows.
 */

import type { UserWordBank } from '@prisma/client';

import { isWordStatus, type WordStatus } from '../config/wordBank.js';
import { prisma } from '../lib/prisma.js';
import { enrichWord } from './morphology/enrich.js';
import type { WordForm } from './morphology/inflect.js';
import { FORM_LABELS } from './morphology/inflect.js';
import { initialSrsState, masteryProgress } from './practice/srs.js';
import { TranslationError, translateToHebrew } from './translationService.js';

export class WordBankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordBankError';
  }
}

export interface CaptureInput {
  userId: string;
  /** Raw tapped text; normalised internally. */
  word: string;
  /** The lyric line it came from — enables fill-in-the-blank practice. */
  contextLine?: string | null | undefined;
  trackId?: string | null | undefined;
  /**
   * Translation the client already displayed. Used only if the server-side
   * lookup fails, so a transient MyMemory outage can't block capture.
   */
  translation?: string | null | undefined;
}

/** A word-bank row shaped for the API, with `forms` already parsed. */
export interface WordBankEntry {
  id: string;
  word: string;
  lemma: string;
  root: string;
  translation: string;
  partOfSpeech: string;
  cefrLevel: string | null;
  forms: WordForm[];
  contextLine: string | null;
  trackId: string | null;
  status: WordStatus;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  attemptCount: number;
  correctCount: number;
  /** 0–1 progress toward mastery, for the UI ring. */
  mastery: number;
  /** Share of answers correct, or null before the first attempt. */
  accuracy: number | null;
  createdAt: string;
}

const FORM_LABEL_SET = new Set<string>(FORM_LABELS);

/**
 * Parses the JSON-encoded forms column defensively.
 *
 * Anything malformed degrades to an empty family rather than throwing — a bad
 * row must not be able to break the practice session for every other word.
 */
export function parseForms(raw: string): WordForm[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WordForm =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as WordForm).form === 'string' &&
        typeof (item as WordForm).label === 'string' &&
        FORM_LABEL_SET.has((item as WordForm).label),
    );
  } catch {
    return [];
  }
}

export function serializeForms(forms: WordForm[]): string {
  return JSON.stringify(forms);
}

/** Maps a Prisma row to the API shape. */
export function toEntry(row: UserWordBank): WordBankEntry {
  return {
    id: row.id,
    word: row.word,
    lemma: row.lemma,
    root: row.root,
    translation: row.translation,
    partOfSpeech: row.partOfSpeech,
    cefrLevel: row.cefrLevel,
    forms: parseForms(row.forms),
    contextLine: row.contextLine,
    trackId: row.trackId,
    status: isWordStatus(row.status) ? row.status : 'LEARNING',
    dueAt: row.dueAt.toISOString(),
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lapses: row.lapses,
    attemptCount: row.attemptCount,
    correctCount: row.correctCount,
    mastery: masteryProgress({
      intervalDays: row.intervalDays,
      status: isWordStatus(row.status) ? row.status : 'LEARNING',
    }),
    accuracy: row.attemptCount > 0 ? row.correctCount / row.attemptCount : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Resolves the Hebrew translation for a lemma.
 *
 * The player translates the word before the learner can even press save, so the
 * Translation cache is nearly always warm and this costs no external call.
 */
async function resolveTranslation(lemma: string, fallback?: string | null): Promise<string> {
  try {
    return await translateToHebrew(lemma);
  } catch (err) {
    if (err instanceof TranslationError && fallback && fallback.trim()) {
      return fallback.trim();
    }
    throw err;
  }
}

export interface CaptureResult {
  entry: WordBankEntry;
  /** False when this reinforced an existing family member. Drives 201 vs 200. */
  created: boolean;
}

/**
 * Captures (or reinforces) a word.
 *
 * Re-capturing an existing lemma deliberately does NOT reset its schedule —
 * that would let a learner erase their own review history by re-tapping a word.
 * It only backfills missing context and refreshes the enrichment.
 */
export async function captureWord(input: CaptureInput): Promise<CaptureResult> {
  const enrichment = enrichWord(input.word, input.contextLine);
  if (!enrichment) {
    throw new WordBankError('That is not a word we can save.');
  }

  // Only link a track the caller actually has; otherwise keep the context line
  // but drop the association rather than rejecting the capture outright.
  let trackId: string | null = null;
  if (input.trackId) {
    const link = await prisma.userTrackProgress.findUnique({
      where: { userId_trackId: { userId: input.userId, trackId: input.trackId } },
      select: { trackId: true },
    });
    trackId = link?.trackId ?? null;
  }

  const translation = await resolveTranslation(enrichment.lemma, input.translation);
  const initial = initialSrsState();
  const contextLine = input.contextLine?.trim() || null;

  // Checked before the upsert so the caller can distinguish a new capture from
  // a reinforcement. Deriving this from the returned row is not possible: an
  // existing-but-never-practised word looks identical to a brand-new one.
  const existing = await prisma.userWordBank.findUnique({
    where: { userId_lemma: { userId: input.userId, lemma: enrichment.lemma } },
    select: { id: true },
  });

  const row = await prisma.userWordBank.upsert({
    where: {
      userId_lemma: { userId: input.userId, lemma: enrichment.lemma },
    },
    create: {
      userId: input.userId,
      word: enrichment.surface,
      lemma: enrichment.lemma,
      root: enrichment.root,
      translation,
      partOfSpeech: enrichment.partOfSpeech,
      cefrLevel: enrichment.cefrLevel,
      forms: serializeForms(enrichment.forms),
      contextLine,
      trackId,
      status: initial.status,
      easeFactor: initial.easeFactor,
      intervalDays: initial.intervalDays,
      repetitions: initial.repetitions,
      lapses: initial.lapses,
      dueAt: initial.dueAt,
    },
    update: {
      // Refresh enrichment (the engine may have improved) and backfill context,
      // but never touch the SRS columns.
      root: enrichment.root,
      translation,
      partOfSpeech: enrichment.partOfSpeech,
      cefrLevel: enrichment.cefrLevel,
      forms: serializeForms(enrichment.forms),
      ...(contextLine ? { contextLine } : {}),
      ...(trackId ? { trackId } : {}),
    },
  });

  return { entry: toEntry(row), created: existing === null };
}

export interface ListOptions {
  status?: WordStatus | undefined;
  limit: number;
  offset: number;
}

export async function listWords(
  userId: string,
  options: ListOptions,
): Promise<{ words: WordBankEntry[]; total: number }> {
  const where = { userId, ...(options.status ? { status: options.status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.userWordBank.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      skip: options.offset,
      take: options.limit,
    }),
    prisma.userWordBank.count({ where }),
  ]);
  return { words: rows.map(toEntry), total };
}

export async function getWord(userId: string, wordId: string): Promise<WordBankEntry | null> {
  const row = await prisma.userWordBank.findFirst({ where: { id: wordId, userId } });
  return row ? toEntry(row) : null;
}

/** Returns true when a row was actually removed (false = not the caller's). */
export async function deleteWord(userId: string, wordId: string): Promise<boolean> {
  const result = await prisma.userWordBank.deleteMany({ where: { id: wordId, userId } });
  return result.count > 0;
}

export interface WordBankStats {
  total: number;
  learning: number;
  review: number;
  mastered: number;
  /** Words due for practice right now. */
  due: number;
  /** Correct answers / total answers across every review, or null if none. */
  accuracy: number | null;
}

export async function getStats(userId: string, now: Date = new Date()): Promise<WordBankStats> {
  const [grouped, due, totals] = await Promise.all([
    prisma.userWordBank.groupBy({ by: ['status'], where: { userId }, _count: true }),
    prisma.userWordBank.count({ where: { userId, dueAt: { lte: now } } }),
    prisma.userWordBank.aggregate({
      where: { userId },
      _sum: { attemptCount: true, correctCount: true },
    }),
  ]);

  const byStatus = new Map(grouped.map((g) => [g.status, g._count]));
  const attempts = totals._sum.attemptCount ?? 0;
  const correct = totals._sum.correctCount ?? 0;

  return {
    total: [...byStatus.values()].reduce((sum, count) => sum + count, 0),
    learning: byStatus.get('LEARNING') ?? 0,
    review: byStatus.get('REVIEW') ?? 0,
    mastered: byStatus.get('MASTERED') ?? 0,
    due,
    accuracy: attempts > 0 ? correct / attempts : null,
  };
}
