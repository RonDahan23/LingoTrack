import { describe, expect, it } from 'vitest';

import { normaliseForVocabulary, rareTokenIndices, MAX_MARKED_PER_LINE } from './rareWords';
import { tokenizeLine } from './wordTokenize';

/** The marked words of a line, as text, for readable assertions. */
function markedWords(line: string, vocabulary: string[], max?: number): string[] {
  const tokens = tokenizeLine(line);
  const indices = rareTokenIndices(tokens, new Set(vocabulary), max);
  return [...indices].sort((a, b) => a - b).map((i) => tokens[i]!.text);
}

describe('normaliseForVocabulary', () => {
  it('lowercases and strips surrounding punctuation', () => {
    expect(normaliseForVocabulary('Wreckage,')).toBe('wreckage');
    expect(normaliseForVocabulary('"Neon"')).toBe('neon');
  });

  it('keeps an intra-word apostrophe, matching the backend tokenizer', () => {
    expect(normaliseForVocabulary("don't")).toBe("don't");
  });

  it('folds a curly apostrophe to a straight one', () => {
    // Lyrics use both; the server list only ever contains straight ones.
    expect(normaliseForVocabulary('don’t')).toBe("don't");
  });

  it('trims apostrophes and hyphens at the edges', () => {
    expect(normaliseForVocabulary("'til")).toBe('til');
    expect(normaliseForVocabulary('well-')).toBe('well');
  });
});

describe('rareTokenIndices', () => {
  it('marks only the words the server listed', () => {
    expect(markedWords('The wreckage of a promise', ['wreckage', 'promise'])).toEqual([
      'wreckage',
      'promise',
    ]);
  });

  it('matches despite case and trailing punctuation in the lyric', () => {
    expect(markedWords('Neon, and the Gravity!', ['neon', 'gravity'])).toEqual([
      'Neon',
      'Gravity',
    ]);
  });

  it('never marks a separator token', () => {
    const tokens = tokenizeLine('neon glow');
    const marked = rareTokenIndices(tokens, new Set(['neon', 'glow']));
    for (const i of marked) expect(tokens[i]!.isWord).toBe(true);
  });

  it('marks nothing when the line is too dense to read', () => {
    // A wall of underlines carries no information.
    const line = 'one two three four five six seven';
    const all = line.split(' ');
    expect(markedWords(line, all)).toEqual([]);
  });

  it('marks a line that sits exactly on the cap', () => {
    const line = 'one two three four five six';
    expect(markedWords(line, line.split(' '))).toHaveLength(MAX_MARKED_PER_LINE);
  });

  it('returns nothing for an empty vocabulary', () => {
    expect(markedWords('The wreckage of a promise', [])).toEqual([]);
  });

  it('leaves an ordinary line alone', () => {
    expect(markedWords('I hold your heart tonight', ['wreckage'])).toEqual([]);
  });
});
