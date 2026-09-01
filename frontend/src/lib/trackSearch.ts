/**
 * Pure search over the ranked-tracks payload.
 *
 * Search deliberately spans *all three* difficulty buckets rather than the
 * active tab — the dashboard already holds the whole ranked payload, so this
 * needs no extra request and stays instant as the user types.
 *
 * Scope note: `/api/tracks/ranked` only returns graded tracks, so UNGRADED
 * songs are not searchable here by construction (they have no bucket to live
 * in). Run "Analyze my library" to bring them in.
 */

import {
  DIFFICULTY_ORDER,
  type DifficultyLevel,
  type RankedTracks,
  type Track,
} from '../types/track';

export interface TrackSearchResult {
  track: Track;
  /** Which tab the track came from — shown in results since they're mixed. */
  level: DifficultyLevel;
}

/**
 * Lowercase, strip diacritics, and reduce punctuation to single spaces, so
 * "Don't Stop Me Now" matches "dont stop" and "Beyoncé" matches "beyonce".
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Apostrophes are dropped, not spaced, so "dont stop" finds "Don't Stop"
    // and a typed "don't" normalises to the same token either way.
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Higher sorts first. Exported for the tests. */
export function relevanceRank(title: string, query: string): number {
  if (title.startsWith(query)) return 3;
  if (title.includes(query)) return 2;
  return 1;
}

/**
 * Every whitespace-separated term must appear somewhere in "title artist", so
 * terms can be given in any order ("bowie heroes" and "heroes bowie" both hit).
 * Results are ranked title-prefix > title-substring > artist-only, then
 * easiest-first to match the ordering the tabs use.
 */
export function searchTracks(
  ranked: RankedTracks,
  query: string,
): TrackSearchResult[] {
  const normalizedQuery = normalizeForSearch(query);
  if (normalizedQuery === '') return [];
  const terms = normalizedQuery.split(' ');

  const scored: { result: TrackSearchResult; rank: number; title: string }[] = [];

  for (const level of DIFFICULTY_ORDER) {
    for (const track of ranked.levels[level]?.tracks ?? []) {
      const title = normalizeForSearch(track.title);
      const haystack = `${title} ${normalizeForSearch(track.artist)}`;
      if (!terms.every((term) => haystack.includes(term))) continue;

      scored.push({
        result: { track, level },
        rank: relevanceRank(title, normalizedQuery),
        title,
      });
    }
  }

  scored.sort(
    (a, b) =>
      b.rank - a.rank ||
      a.result.track.difficultyScore - b.result.track.difficultyScore ||
      a.title.localeCompare(b.title),
  );

  return scored.map((entry) => entry.result);
}

/** Total graded tracks across all buckets — the "searched N songs" denominator. */
export function totalTrackCount(ranked: RankedTracks): number {
  return DIFFICULTY_ORDER.reduce(
    (sum, level) => sum + (ranked.levels[level]?.tracks.length ?? 0),
    0,
  );
}
