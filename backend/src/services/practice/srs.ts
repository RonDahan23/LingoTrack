/**
 * Spaced repetition — a SM-2 variant, pure and deterministic.
 *
 * No DB, no clock of its own: `now` is always injected (same convention as
 * sessionService/tokenService), so the whole schedule is unit-testable.
 *
 * The classic SM-2 loop: a passing grade multiplies the interval by the card's
 * ease factor, a failing grade resets the interval and knocks the ease down, so
 * words you keep missing come back fast and words you know drift out to weeks.
 */

import {
  MAX_QUALITY,
  MIN_QUALITY,
  PASSING_QUALITY,
  SRS,
  type WordStatus,
} from '../../config/wordBank.js';

/** The mutable scheduling state stored on each UserWordBank row. */
export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  /** Consecutive passing reviews. Reset to 0 on a lapse. */
  repetitions: number;
  /** Lifetime count of failed reviews — a difficulty signal for the UI. */
  lapses: number;
  status: WordStatus;
  dueAt: Date;
}

export interface ReviewOutcome extends SrsState {
  /** True when the grade counted as a successful recall. */
  passed: boolean;
  /** Days until the next review — convenience for the client's "+3d" badge. */
  nextIntervalDays: number;
}

/** Scheduling state for a freshly captured word: due immediately. */
export function initialSrsState(now: Date = new Date()): SrsState {
  return {
    easeFactor: SRS.INITIAL_EASE,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    status: 'LEARNING',
    dueAt: now,
  };
}

function clampQuality(quality: number): number {
  if (!Number.isFinite(quality)) return MIN_QUALITY;
  return Math.min(MAX_QUALITY, Math.max(MIN_QUALITY, Math.round(quality)));
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * SM-2's ease adjustment. A perfect answer nudges ease up slightly; anything
 * below perfect pulls it down, steeply for outright failures.
 */
function nextEase(current: number, quality: number): number {
  const delta = 0.1 - (MAX_QUALITY - quality) * (0.08 + (MAX_QUALITY - quality) * 0.02);
  return Math.max(SRS.MIN_EASE, current + delta);
}

/**
 * Derives the learner-visible status from the schedule.
 *
 * Status is a projection of the SRS numbers, never stored independently — that
 * way the badge in the UI can't disagree with when the word is actually due.
 */
export function deriveStatus(repetitions: number, intervalDays: number): WordStatus {
  if (intervalDays >= SRS.MASTERED_INTERVAL_DAYS) return 'MASTERED';
  if (repetitions >= SRS.REVIEW_REPETITIONS) return 'REVIEW';
  return 'LEARNING';
}

/**
 * Applies one graded review to a word's schedule.
 *
 * `quality` is SM-2's 0–5 scale: 5 perfect, 3 correct-but-effortful, 0 blank.
 * The client can pass a plain boolean via `qualityFromCorrect` below when it has
 * no finer signal.
 */
export function reviewWord(
  state: SrsState,
  quality: number,
  now: Date = new Date(),
): ReviewOutcome {
  const graded = clampQuality(quality);
  const passed = graded >= PASSING_QUALITY;
  const easeFactor = nextEase(state.easeFactor, graded);

  let repetitions: number;
  let intervalDays: number;
  let lapses = state.lapses;

  if (passed) {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) {
      intervalDays = SRS.FIRST_INTERVAL_DAYS;
    } else if (repetitions === 2) {
      intervalDays = SRS.SECOND_INTERVAL_DAYS;
    } else {
      // Round up so the interval always grows, even at the 1.3 ease floor.
      intervalDays = Math.ceil(state.intervalDays * easeFactor);
    }
    intervalDays = Math.min(intervalDays, SRS.MAX_INTERVAL_DAYS);
  } else {
    // A lapse sends the word back to the start of the learning queue. The ease
    // penalty persists, so a repeatedly-missed word keeps shorter intervals
    // even after it starts passing again.
    repetitions = 0;
    intervalDays = 0;
    lapses += 1;
  }

  return {
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    passed,
    nextIntervalDays: intervalDays,
    status: deriveStatus(repetitions, intervalDays),
    // A failed word is due again immediately, inside the same session.
    dueAt: addDays(now, intervalDays),
  };
}

/**
 * Maps a plain correct/incorrect answer onto the 0–5 scale.
 *
 * Correct answers grade 4 rather than 5 — a multiple-choice hit involves
 * recognition plus a bit of luck, so it shouldn't inflate ease as fast as a
 * self-reported perfect recall.
 */
export function qualityFromCorrect(correct: boolean, responseMs?: number | null): number {
  if (!correct) return 1;
  // A fast answer suggests genuine recall rather than deliberation.
  if (responseMs != null && responseMs > 0 && responseMs < 3000) return 5;
  return 4;
}

/** True when the word is ready for review at `now`. */
export function isDue(dueAt: Date, now: Date = new Date()): boolean {
  return dueAt.getTime() <= now.getTime();
}

/** Fraction of the way to mastery, 0–1. Drives the progress ring in the UI. */
export function masteryProgress(state: Pick<SrsState, 'intervalDays' | 'status'>): number {
  if (state.status === 'MASTERED') return 1;
  const ratio = state.intervalDays / SRS.MASTERED_INTERVAL_DAYS;
  return Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
}
