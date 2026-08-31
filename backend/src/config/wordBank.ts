/**
 * Word-bank + practice constants (Step 5).
 *
 * Mirrors src/config/difficulty.ts: the value sets live here so the DB columns
 * (plain `String`, no Prisma enums) can't drift from the code that reads them.
 */

/** Learning states a word moves through. Persisted in UserWordBank.status. */
export const WORD_STATUSES = ['LEARNING', 'REVIEW', 'MASTERED'] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];

export function isWordStatus(value: string): value is WordStatus {
  return (WORD_STATUSES as readonly string[]).includes(value);
}

/** Coarse part of speech. UNKNOWN is a legitimate outcome, not an error. */
export const PARTS_OF_SPEECH = ['NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'OTHER', 'UNKNOWN'] as const;
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number];

export function isPartOfSpeech(value: string): value is PartOfSpeech {
  return (PARTS_OF_SPEECH as readonly string[]).includes(value);
}

/** Exercise kinds the practice engine can generate. */
export const EXERCISE_TYPES = [
  /** Show English, pick the Hebrew. */
  'MCQ_EN_TO_HE',
  /** Show Hebrew, pick the English. */
  'MCQ_HE_TO_EN',
  /** Original lyric line with the word blanked out. */
  'FILL_BLANK',
  /** Match an inflected form to its base form (e.g. "climbing" -> "climb"). */
  'FORM_MATCH',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export function isExerciseType(value: string): value is ExerciseType {
  return (EXERCISE_TYPES as readonly string[]).includes(value);
}

/**
 * SRS tuning. A SM-2 variant — see services/practice/srs.ts.
 *
 * `MASTERED_INTERVAL_DAYS` is the point at which a word stops being "practice"
 * and counts as learned; `REVIEW_REPETITIONS` is when it graduates out of the
 * initial learning drill. Both are thresholds, not schedules.
 */
export const SRS = {
  /** Starting ease. SM-2's canonical default. */
  INITIAL_EASE: 2.5,
  /** Ease can never drop below this, or lapsed words review forever. */
  MIN_EASE: 1.3,
  /** First correct answer schedules this far out. */
  FIRST_INTERVAL_DAYS: 1,
  /** Second consecutive correct answer. */
  SECOND_INTERVAL_DAYS: 3,
  /** Consecutive correct answers before status leaves LEARNING. */
  REVIEW_REPETITIONS: 2,
  /** Interval at which a word is considered MASTERED. */
  MASTERED_INTERVAL_DAYS: 21,
  /** Cap so a long-known word still resurfaces roughly twice a year. */
  MAX_INTERVAL_DAYS: 180,
} as const;

/** Answer grades submitted by the client, SM-2 style (0 = blank, 5 = perfect). */
export const MIN_QUALITY = 0;
export const MAX_QUALITY = 5;
/** Grades >= this count as a correct recall and advance the schedule. */
export const PASSING_QUALITY = 3;

/** How many exercises a single practice session serves by default. */
export const DEFAULT_SESSION_SIZE = 10;
export const MAX_SESSION_SIZE = 50;

/** Multiple-choice option count (1 correct + N-1 distractors). */
export const MCQ_OPTION_COUNT = 4;
