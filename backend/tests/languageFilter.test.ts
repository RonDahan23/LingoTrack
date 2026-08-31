import { describe, expect, it } from 'vitest';
import {
  hasNonLatinScript,
  isEnglishLyrics,
  isEnglishText,
  isEnglishTrack,
} from '../src/services/languageFilter.js';

describe('hasNonLatinScript', () => {
  it('is false for Latin text, including accents', () => {
    expect(hasNonLatinScript('Bohemian Rhapsody')).toBe(false);
    expect(hasNonLatinScript('Beyoncé')).toBe(false);
    expect(hasNonLatinScript('Sigur Rós')).toBe(false);
    expect(hasNonLatinScript('Café del Mar')).toBe(false);
  });

  it('is true for Hebrew, Arabic, Cyrillic, Greek, and CJK', () => {
    expect(hasNonLatinScript('עוד יום')).toBe(true); // Hebrew
    expect(hasNonLatinScript('أغنية')).toBe(true); // Arabic
    expect(hasNonLatinScript('Кино')).toBe(true); // Cyrillic
    expect(hasNonLatinScript('Ελλάδα')).toBe(true); // Greek
    expect(hasNonLatinScript('米津玄師')).toBe(true); // CJK
    expect(hasNonLatinScript('방탄소년단')).toBe(true); // Hangul
  });
});

describe('isEnglishTrack', () => {
  it('keeps English tracks', () => {
    expect(isEnglishTrack('Yellow', 'Coldplay')).toBe(true);
  });

  it('rejects a Hebrew title or a Hebrew artist', () => {
    expect(isEnglishTrack('עוד יום', 'עברי לידר')).toBe(false);
    expect(isEnglishTrack('Some English Title', 'עברי לידר')).toBe(false);
    expect(isEnglishTrack('שיר עברי', 'Some English Artist')).toBe(false);
  });

  it('rejects a mixed-script title', () => {
    expect(isEnglishTrack('Remix שיר', 'DJ')).toBe(false);
  });
});

describe('isEnglishText', () => {
  it('accepts English lyric text', () => {
    expect(isEnglishText('I was scared of dentists and the dark, I was scared of pretty girls')).toBe(true);
  });

  it('rejects French (Latin script, but not English)', () => {
    expect(isEnglishText('Oh ma douce souffrance, pourquoi s’acharner tu recommences')).toBe(false);
  });

  it('rejects Hebrew lyric text', () => {
    expect(isEnglishText('אני באה סטייל אני יודעת')).toBe(false);
  });
});

describe('isEnglishLyrics', () => {
  it('strips LRC tags before detecting', () => {
    const lrc = ['[ar:Adele]', '[00:10.00]This is the end', '[00:14.00]Hold your breath and count to ten'].join('\n');
    expect(isEnglishLyrics(lrc)).toBe(true);
  });

  it('rejects French LRC', () => {
    const lrc = ['[00:10.00]Oh ma douce souffrance', '[00:14.00]Pourquoi s’acharner tu recommences'].join('\n');
    expect(isEnglishLyrics(lrc)).toBe(false);
  });
});
