/**
 * Chooses the next track to listen to, matched to the learner's level.
 *
 * Pure and deterministic — no clock, no randomness, no database — so the
 * choice is testable and a given (library, seed) always yields the same track.
 * The caller supplies the seed; see `pickTrack`.
 */

export interface PickCandidate {
  id: string;
  /** 0.0–10.0, as graded by the difficulty engine. */
  difficultyScore: number;
  /** Share of the track's words the learner has mastered; 0 when untouched. */
  masteredPct: number;
}

/**
 * How far above the learner's current level to aim.
 *
 * Comprehensible input: material slightly beyond what is already comfortable
 * teaches, material at the same level only reinforces. A third of a point on
 * the 0–10 scale is roughly one step within a difficulty bucket, not a jump
 * across one — landing in ADVANCED because of a rounding step would defeat
 * the point.
 */
const STRETCH = 0.35;

/**
 * How many of the closest tracks are treated as equally good matches.
 *
 * Without a band the button would return the same track forever, which makes
 * it useless the second time it is pressed. A band of five keeps every
 * candidate genuinely level-appropriate while leaving room to vary.
 */
const BAND_SIZE = 5;

/** Where a learner with no history starts: the gentler end of their library. */
const COLD_START_PERCENTILE = 0.25;

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] as number;
}

/**
 * Estimates the difficulty the learner is ready for.
 *
 * Evidence is the tracks they have actually made progress on, weighted by how
 * much progress — a track they have half-mastered says more about their level
 * than one they opened once. With no progress anywhere, falls back to the
 * lower quartile of their own library rather than an absolute constant, since
 * "easy" means something different for different libraries.
 */
export function estimateTargetScore(candidates: readonly PickCandidate[]): number {
  if (candidates.length === 0) return 0;

  const touched = candidates.filter((c) => c.masteredPct > 0);

  if (touched.length === 0) {
    const scores = candidates.map((c) => c.difficultyScore).sort((a, b) => a - b);
    return percentile(scores, COLD_START_PERCENTILE) + STRETCH;
  }

  const weight = touched.reduce((sum, c) => sum + c.masteredPct, 0);
  const weighted = touched.reduce((sum, c) => sum + c.difficultyScore * c.masteredPct, 0);

  return weighted / weight + STRETCH;
}

export interface PickOptions {
  /** Track to avoid returning — normally the previous pick. */
  excludeId?: string | null;
  /**
   * Varies the choice within the matched band. The caller passes something
   * that changes between presses; keeping it a parameter is what lets this
   * function stay deterministic.
   */
  seed: number;
}

/**
 * Picks one track whose difficulty is closest to `target`.
 *
 * Ties break on id so the ordering is total and stable — two tracks at the
 * same distance must not swap places between calls, or the seed would stop
 * meaning anything.
 */
export function pickTrack(
  candidates: readonly PickCandidate[],
  target: number,
  { excludeId, seed }: PickOptions,
): PickCandidate | null {
  if (candidates.length === 0) return null;

  // Exclude the previous pick unless it is the only thing left, in which case
  // repeating it beats returning nothing.
  const pool = candidates.filter((c) => c.id !== excludeId);
  const usable = pool.length > 0 ? pool : candidates;

  const ranked = [...usable].sort((a, b) => {
    const byDistance =
      Math.abs(a.difficultyScore - target) - Math.abs(b.difficultyScore - target);
    return byDistance !== 0 ? byDistance : a.id.localeCompare(b.id);
  });

  const band = ranked.slice(0, Math.min(BAND_SIZE, ranked.length));
  // Non-negative modulo: a caller passing a negative seed must not crash.
  const index = ((seed % band.length) + band.length) % band.length;
  return band[index] as PickCandidate;
}
