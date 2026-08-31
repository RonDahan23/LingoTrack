/**
 * Difficulty buckets and thresholds — ARCHITECTURE.md section 3.
 *
 * These live in exactly one place so the score boundaries can never drift from
 * the dashboard tab labels ("Easy Tracks" / "Medium" / "Challenging") or from
 * the string values persisted in `Track.difficultyLevel`.
 */

export const DIFFICULTY_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/**
 * Step 2 ingests tracks from Spotify before Step 3 can grade them, but
 * `Track.difficultyLevel` is non-nullable with no default. Rather than write a
 * fake BEGINNER — which would pollute the "Easy Tracks" tab with ungraded
 * songs — ingestion writes this sentinel. It is deliberately NOT part of
 * DIFFICULTY_LEVELS, so `/api/tracks/ranked` filtering by real buckets excludes
 * ungraded tracks for free.
 */
export const UNGRADED_LEVEL = 'UNGRADED';

export const PENDING_DIFFICULTY_SCORE = 0.0;

export function isGraded(level: string): level is DifficultyLevel {
  return isDifficultyLevel(level);
}

export const MIN_DIFFICULTY_SCORE = 0.0;
export const MAX_DIFFICULTY_SCORE = 10.0;

/** Inclusive upper bound of each bucket; ADVANCED runs to MAX_DIFFICULTY_SCORE. */
export const DIFFICULTY_THRESHOLDS = {
  BEGINNER: 3.5,
  INTERMEDIATE: 7.0,
} as const;

/**
 * Relative contribution of each scoring layer — must sum to 1.
 *
 * Recalibrated from the spec's 60/20/20 (ARCHITECTURE.md §3): text complexity
 * dropped 20→10 and delivery speed raised 20→30. Rationale: for sung/rapped
 * lyrics, how fast words come at the listener is a stronger difficulty signal
 * than sentence structure, and the text layer no longer carries much (synced
 * lyrics are short fragments). Under the old weights even the fastest, densest
 * rap (Rap God, Worldwide Choppers) capped ~6.8 and nothing reached ADVANCED.
 * Verified against calibration samples: easy pop stays BEGINNER/INTERMEDIATE,
 * genuinely hard rap now reaches ADVANCED.
 */
export const DIFFICULTY_WEIGHTS = {
  vocabulary: 0.6,
  textComplexity: 0.1,
  audioDynamics: 0.3,
} as const;

/** Maps a raw 0.0–10.0 score onto its persisted bucket. */
export function toDifficultyLevel(score: number): DifficultyLevel {
  if (!Number.isFinite(score)) {
    throw new RangeError(`difficultyScore must be a finite number, received ${score}`);
  }
  if (score < MIN_DIFFICULTY_SCORE || score > MAX_DIFFICULTY_SCORE) {
    throw new RangeError(
      `difficultyScore must be within ${MIN_DIFFICULTY_SCORE}–${MAX_DIFFICULTY_SCORE}, received ${score}`,
    );
  }

  if (score <= DIFFICULTY_THRESHOLDS.BEGINNER) return 'BEGINNER';
  if (score <= DIFFICULTY_THRESHOLDS.INTERMEDIATE) return 'INTERMEDIATE';
  return 'ADVANCED';
}

export function isDifficultyLevel(value: string): value is DifficultyLevel {
  return (DIFFICULTY_LEVELS as readonly string[]).includes(value);
}
