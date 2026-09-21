/**
 * Which words in a track are likely to be unfamiliar.
 *
 * Not CEFR level, deliberately. `config/cefr.ts` is a 465-word seed that
 * treats everything unlisted as near-C2 — sound for *scoring*, where
 * averaging over a whole song absorbs individual errors, but useless per word:
 * measured on a sample lyric, it called half the content words advanced,
 * including "told", "only" and "standing", while flagging just one of the
 * genuinely hard ones.
 *
 * Rarity is the better signal, and the library is its own corpus. A word that
 * turns up across many tracks is common; one that appears in a couple is not.
 * That calibrates to the English of song lyrics rather than to general prose,
 * needs no curated list, and — unlike expanding the CEFR lexicon — changes no
 * difficulty score, since nothing here feeds the grading engine.
 *
 * Pure and deterministic: the caller supplies the corpus counts.
 */

import type { CefrLevel } from '../../config/cefr.js';

/** How many distinct tracks each word appears in. Repetition within one track
 *  is ignored, so a word chanted through a chorus is not made to look common. */
export type DocumentFrequency = ReadonlyMap<string, number>;

/**
 * A word is rare if it appears in no more than this share of the library.
 *
 * A proportion rather than a fixed count, so the threshold keeps its meaning
 * as a library grows: with 40 tracks a word must appear in at most 4, with 400
 * at most 40.
 */
const RARE_SHARE = 0.10;

/**
 * Below this many tracks the corpus says nothing — in a library of five, every
 * word is "rare". The caller shows no highlights at all rather than guessing.
 */
export const MIN_CORPUS_TRACKS = 15;

/** Very short words are function-ish noise even when the corpus says rare. */
const MIN_WORD_LENGTH = 4;

/** Curated levels that are never highlighted, whatever the corpus thinks. A
 *  hand-placed level beats an inferred one, and these are words a learner at
 *  any level has met. */
const EASY_LEVELS: ReadonlySet<CefrLevel> = new Set<CefrLevel>(['A1', 'A2', 'B1']);

/** Curated levels that are always highlighted, even if the corpus saw them
 *  often — a library heavy on one artist can make a hard word look ordinary. */
const HARD_LEVELS: ReadonlySet<CefrLevel> = new Set<CefrLevel>(['B2', 'C1', 'C2']);

export interface RarityInputs {
  /** Distinct content words of the track, already normalised. */
  words: readonly string[];
  documentFrequency: DocumentFrequency;
  /** Tracks in the corpus the frequencies were counted over. */
  corpusSize: number;
  /** Curated level for a word, or null when unlisted. */
  cefrLevel: (word: string) => CefrLevel | null;
}

/**
 * Builds the document-frequency map from each track's distinct words.
 *
 * Takes one entry per track, already de-duplicated, so callers decide how to
 * tokenise and what counts as a content word.
 */
export function buildDocumentFrequency(
  tracks: readonly (readonly string[])[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const words of tracks) {
    for (const word of new Set(words)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The words in one track worth marking as unfamiliar.
 *
 * Returns them rarest-first, so a caller that wants only the top few gets the
 * most useful ones. An empty result is normal and means "nothing stands out" —
 * which is the right answer for a simple song.
 */
export function selectRareWords({
  words,
  documentFrequency,
  corpusSize,
  cefrLevel,
}: RarityInputs): string[] {
  // Too small a corpus to distinguish rare from merely unseen.
  if (corpusSize < MIN_CORPUS_TRACKS) return [];

  const threshold = Math.max(1, Math.floor(corpusSize * RARE_SHARE));

  const rare = [...new Set(words)].filter((word) => {
    const level = cefrLevel(word);
    if (level && EASY_LEVELS.has(level)) return false;
    if (level && HARD_LEVELS.has(level)) return true;
    if (word.length < MIN_WORD_LENGTH) return false;

    // Absent from the map means this track is the only one that has it, which
    // is as rare as it gets.
    return (documentFrequency.get(word) ?? 1) <= threshold;
  });

  // Rarest first, ties alphabetical so the order is total and stable.
  return rare.sort((a, b) => {
    const byFrequency = (documentFrequency.get(a) ?? 1) - (documentFrequency.get(b) ?? 1);
    return byFrequency !== 0 ? byFrequency : a.localeCompare(b);
  });
}
