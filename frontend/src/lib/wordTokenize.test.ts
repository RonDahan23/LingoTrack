import { describe, it, expect } from 'vitest';
import { cleanWord, tokenizeLine } from './wordTokenize';

describe('tokenizeLine', () => {
  it('round-trips: joining tokens reproduces the input', () => {
    const line = "Don't stop, believe-in me!";
    expect(tokenizeLine(line).map((t) => t.text).join('')).toBe(line);
  });

  it('marks words tappable and separators not', () => {
    const tokens = tokenizeLine('hey you');
    expect(tokens.map((t) => [t.text, t.isWord])).toEqual([
      ['hey', true],
      [' ', false],
      ['you', true],
    ]);
  });

  it('keeps internal apostrophes and hyphens inside a word', () => {
    expect(tokenizeLine("don't")).toEqual([{ text: "don't", isWord: true }]);
    expect(tokenizeLine('twenty-one')).toEqual([{ text: 'twenty-one', isWord: true }]);
  });

  it('handles leading/trailing punctuation', () => {
    const tokens = tokenizeLine('...wait!');
    expect(tokens).toEqual([
      { text: '...', isWord: false },
      { text: 'wait', isWord: true },
      { text: '!', isWord: false },
    ]);
  });

  it('returns nothing tappable for an empty or symbol-only line', () => {
    expect(tokenizeLine('').length).toBe(0);
    expect(tokenizeLine('♪♪').every((t) => !t.isWord)).toBe(true);
  });
});

describe('cleanWord', () => {
  it('trims edge punctuation but keeps inner marks', () => {
    expect(cleanWord('"Hello,"')).toBe('Hello');
    expect(cleanWord("don't!")).toBe("don't");
    expect(cleanWord('word')).toBe('word');
  });
});
