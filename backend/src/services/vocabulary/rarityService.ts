/**
 * Builds and caches the library-wide word-frequency index used to decide which
 * words in a track are unfamiliar. The maths lives in `rarity.ts`; this is the
 * database shell around it, in the same split as the grading engine.
 *
 * The index is derived from every stored lyric, so it is expensive to build
 * and almost never changes — lyrics are written once when a track is prepared.
 * It is therefore cached in process and rebuilt only when it ages out or the
 * number of tracks with lyrics changes.
 *
 * Cached per instance, like the sync job registry: with several API instances
 * each holds its own copy, which is harmless here because the index is derived
 * data and every copy converges on the same answer.
 */

import { prisma } from '../../lib/prisma.js';
import { isContentWord, tokenize, tokenCefrLevel } from '../grading/tokenizer.js';
import {
  buildDocumentFrequency,
  selectRareWords,
  type DocumentFrequency,
} from './rarity.js';

/** Long enough that a rebuild is rare, short enough that newly prepared tracks
 *  are folded in without a restart. */
const TTL_MS = 30 * 60 * 1000;

interface RarityIndex {
  documentFrequency: DocumentFrequency;
  corpusSize: number;
  builtAt: number;
}

let cached: RarityIndex | null = null;
/** De-dupes concurrent builds: the first request after expiry starts the work
 *  and the rest await the same promise instead of each scanning the lyrics. */
let inFlight: Promise<RarityIndex> | null = null;

async function build(): Promise<RarityIndex> {
  const rows = await prisma.lyricLine.findMany({
    select: { trackId: true, text: true },
  });

  // One entry per track, de-duplicated: document frequency counts tracks, not
  // occurrences, so a word repeated through a chorus is counted once.
  const byTrack = new Map<string, Set<string>>();
  for (const row of rows) {
    let words = byTrack.get(row.trackId);
    if (!words) {
      words = new Set<string>();
      byTrack.set(row.trackId, words);
    }
    for (const token of tokenize(row.text)) {
      if (isContentWord(token)) words.add(token);
    }
  }

  return {
    documentFrequency: buildDocumentFrequency([...byTrack.values()].map((s) => [...s])),
    corpusSize: byTrack.size,
    builtAt: Date.now(),
  };
}

async function getIndex(): Promise<RarityIndex> {
  if (cached && Date.now() - cached.builtAt < TTL_MS) return cached;
  if (inFlight) return inFlight;

  inFlight = build()
    .then((index) => {
      cached = index;
      return index;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Drops the cache. For tests and for scripts that rewrite lyrics in bulk. */
export function resetRarityIndex(): void {
  cached = null;
}

/**
 * The unfamiliar words in one track's lyrics, rarest first.
 *
 * Returns an empty list rather than failing when the library is too small to
 * be informative — see MIN_CORPUS_TRACKS. The caller shows no highlights, and
 * that is the honest outcome: with a handful of tracks, every word looks rare.
 */
export async function rareWordsForLines(lines: readonly string[]): Promise<string[]> {
  const { documentFrequency, corpusSize } = await getIndex();

  const words = new Set<string>();
  for (const line of lines) {
    for (const token of tokenize(line)) {
      if (isContentWord(token)) words.add(token);
    }
  }

  return selectRareWords({
    words: [...words],
    documentFrequency,
    corpusSize,
    cefrLevel: tokenCefrLevel,
  });
}
