import { describe, expect, it } from 'vitest';

import {
  buildDocumentFrequency,
  selectRareWords,
  MIN_CORPUS_TRACKS,
  type DocumentFrequency,
} from '../src/services/vocabulary/rarity.js';
import type { CefrLevel } from '../src/config/cefr.js';

/** A corpus big enough to be meaningful, where `common` is everywhere and
 *  `wreckage` is in one track only. */
function corpus(size = 40): { df: DocumentFrequency; size: number } {
  const tracks: string[][] = [];
  for (let i = 0; i < size; i += 1) {
    const words = ['common', 'ordinary'];
    if (i === 0) words.push('wreckage', 'neon');
    // "shadow" is in a quarter of the library — not rare.
    if (i % 4 === 0) words.push('shadow');
    tracks.push(words);
  }
  return { df: buildDocumentFrequency(tracks), size };
}

const noCefr = () => null;

describe('buildDocumentFrequency', () => {
  it('counts tracks, not occurrences', () => {
    // A word chanted through one chorus must not look common.
    const df = buildDocumentFrequency([['echo', 'echo', 'echo'], ['echo'], ['other']]);
    expect(df.get('echo')).toBe(2);
  });

  it('returns an empty map for an empty corpus', () => {
    expect(buildDocumentFrequency([]).size).toBe(0);
  });
});

describe('selectRareWords', () => {
  const { df, size } = corpus();

  it('marks a word that appears in only one track', () => {
    const rare = selectRareWords({
      words: ['wreckage', 'common'],
      documentFrequency: df,
      corpusSize: size,
      cefrLevel: noCefr,
    });
    expect(rare).toContain('wreckage');
    expect(rare).not.toContain('common');
  });

  it('does not mark a word present across a good share of the library', () => {
    // "shadow" is in 10 of 40 tracks — above the 10% threshold.
    const rare = selectRareWords({
      words: ['shadow'],
      documentFrequency: df,
      corpusSize: size,
      cefrLevel: noCefr,
    });
    expect(rare).toEqual([]);
  });

  it('treats a word absent from the corpus as rare', () => {
    const rare = selectRareWords({
      words: ['zeppelin'],
      documentFrequency: df,
      corpusSize: size,
      cefrLevel: noCefr,
    });
    expect(rare).toEqual(['zeppelin']);
  });

  it('orders rarest first so a caller can take the top few', () => {
    const counts = new Map([['once', 1], ['twice', 2], ['thrice', 3]]);
    expect(
      selectRareWords({
        words: ['thrice', 'once', 'twice'],
        documentFrequency: counts,
        corpusSize: 40,
        cefrLevel: noCefr,
      }),
    ).toEqual(['once', 'twice', 'thrice']);
  });

  it('never marks a curated easy word, however rare the corpus finds it', () => {
    // A hand-placed level beats an inferred one.
    const levels = (w: string): CefrLevel | null => (w === 'rain' ? 'A1' : null);
    expect(
      selectRareWords({
        words: ['rain'],
        documentFrequency: new Map(),
        corpusSize: 40,
        cefrLevel: levels,
      }),
    ).toEqual([]);
  });

  it('always marks a curated hard word, however common the corpus finds it', () => {
    // A library heavy on one artist can make a hard word look ordinary.
    const levels = (w: string): CefrLevel | null => (w === 'ashes' ? 'B2' : null);
    expect(
      selectRareWords({
        words: ['ashes'],
        documentFrequency: new Map([['ashes', 40]]),
        corpusSize: 40,
        cefrLevel: levels,
      }),
    ).toEqual(['ashes']);
  });

  it('ignores very short words even when the corpus calls them rare', () => {
    expect(
      selectRareWords({
        words: ['ooh', 'sky'],
        documentFrequency: new Map(),
        corpusSize: 40,
        cefrLevel: noCefr,
      }),
    ).toEqual([]);
  });

  it('highlights nothing when the corpus is too small to mean anything', () => {
    // In a library of five, every word looks rare.
    expect(
      selectRareWords({
        words: ['wreckage', 'neon'],
        documentFrequency: new Map(),
        corpusSize: MIN_CORPUS_TRACKS - 1,
        cefrLevel: noCefr,
      }),
    ).toEqual([]);
  });

  it('scales the threshold with the library rather than using a fixed count', () => {
    // 3 appearances is rare in a library of 100, ordinary in one of 20.
    const counts = new Map([['drifting', 3]]);
    const args = { words: ['drifting'], documentFrequency: counts, cefrLevel: noCefr };
    expect(selectRareWords({ ...args, corpusSize: 100 })).toEqual(['drifting']);
    expect(selectRareWords({ ...args, corpusSize: 20 })).toEqual([]);
  });

  it('de-duplicates repeated words', () => {
    expect(
      selectRareWords({
        words: ['wreckage', 'wreckage'],
        documentFrequency: df,
        corpusSize: size,
        cefrLevel: noCefr,
      }),
    ).toEqual(['wreckage']);
  });
});
