import { describe, expect, it } from 'vitest';

import { looksUntranslated } from '../src/services/translation/providers.js';
import { lemmatize } from '../src/services/morphology/lemma.js';
import { guessPartOfSpeech } from '../src/services/morphology/pos.js';

/**
 * Regression cover for the "conqu" bug, which needed two independent failures
 * to reach the screen: the lemmatizer invented a non-word, and the translation
 * layer accepted the provider echoing it back. Either guard alone stops it.
 */

describe('lemmatize: -er is only comparative when a real word remains', () => {
  /** How the word bank lemmatises a tapped word with no usable context. */
  const contextFree = (word: string) => lemmatize(word, guessPartOfSpeech(word, null).pos);

  it('leaves words that merely end in -er intact', () => {
    // Every one of these was truncated before: conqu, wat, rememb, whisp, und.
    expect(contextFree('conquer')).toBe('conquer');
    expect(contextFree('water')).toBe('water');
    expect(contextFree('remember')).toBe('remember');
    expect(contextFree('whisper')).toBe('whisper');
    expect(contextFree('under')).toBe('under');
    expect(contextFree('never')).toBe('never');
    expect(contextFree('together')).toBe('together');
  });

  it('still reduces genuine comparatives and superlatives', () => {
    expect(contextFree('bigger')).toBe('big');
    expect(contextFree('stronger')).toBe('strong');
    expect(contextFree('happier')).toBe('happy');
    expect(contextFree('biggest')).toBe('big');
    expect(contextFree('hottest')).toBe('hot');
  });

  it('still reduces agent nouns, which go through deriveRoot', () => {
    expect(contextFree('teacher')).toBe('teach');
  });
});

describe('lemmatize: -ed restores a swallowed silent e', () => {
  const contextFree = (word: string) => lemmatize(word, guessPartOfSpeech(word, null).pos);

  it('does not leave a truncated stem', () => {
    // "tired" -> "tir" was translated phonetically as "טיר" and shown as the
    // meaning of "tired": Hebrew letters, but an English fragment.
    expect(contextFree('tired')).toBe('tire');
    expect(contextFree('hired')).toBe('hire');
    expect(contextFree('wired')).toBe('wire');
    expect(contextFree('stored')).toBe('store');
  });

  it('leaves stems that are already complete alone', () => {
    expect(contextFree('conquered')).toBe('conquer');
    expect(contextFree('walked')).toBe('walk');
    expect(contextFree('wanted')).toBe('want');
    expect(contextFree('needed')).toBe('need');
  });

  it('does not add an e after a consonant that never takes one', () => {
    // "fixe" is not a word.
    expect(contextFree('fixed')).toBe('fix');
  });

  it('keeps the doubling and silent-e rules apart', () => {
    expect(contextFree('hoped')).toBe('hope');
    expect(contextFree('hopped')).toBe('hop');
    expect(contextFree('planned')).toBe('plan');
  });

  it('never returns a truncation of the input', () => {
    // The shape of the bug: output is a strict prefix of the input.
    for (const word of ['conquer', 'water', 'remember', 'whisper', 'under', 'summer', 'winter']) {
      const lemma = contextFree(word);
      const truncated = lemma !== word && word.startsWith(lemma);
      expect(truncated, `${word} -> ${lemma}`).toBe(false);
    }
  });
});

describe('looksUntranslated', () => {
  it('rejects a provider echoing the source back', () => {
    // Exactly what Google returned for the non-word "conqu".
    expect(looksUntranslated('conqu', 'conqu')).toBe(true);
    expect(looksUntranslated('conquer', 'conquer')).toBe(true);
  });

  it('rejects a partial echo, not just an exact one', () => {
    expect(looksUntranslated('conquer', 'conquering')).toBe(true);
  });

  it('accepts a real Hebrew translation', () => {
    expect(looksUntranslated('conquer', 'לִכְבּוֹשׁ')).toBe(false);
    expect(looksUntranslated('a room without a roof', 'חדר ללא גג')).toBe(false);
  });

  it('accepts Hebrew mixed with Latin or digits', () => {
    // A line translation can legitimately keep a name or a number.
    expect(looksUntranslated('I met John in 1999', 'פגשתי את John ב-1999')).toBe(false);
  });

  it('does not reject a source with no Latin letters', () => {
    // "1999" -> "1999" is a correct translation, not an echo.
    expect(looksUntranslated('1999', '1999')).toBe(false);
    expect(looksUntranslated('', '')).toBe(false);
  });
});

describe('guessPartOfSpeech: subject pronoun + verb', () => {
  it('reads a content word after a subject pronoun as a verb', () => {
    // The commonest position a verb occupies in a lyric returned UNKNOWN,
    // which then built a NOUN-shaped family: "tend" got יחיד/רבים.
    expect(guessPartOfSpeech('tend', 'What I tend to do').pos).toBe('VERB');
    expect(guessPartOfSpeech('climb', 'I climb the wall').pos).toBe('VERB');
    expect(guessPartOfSpeech('fall', 'we fall together').pos).toBe('VERB');
    expect(guessPartOfSpeech('broke', 'they broke it').pos).toBe('VERB');
  });

  it('does not conjugate an adverb sitting between subject and verb', () => {
    expect(guessPartOfSpeech('only', 'I only want you').pos).not.toBe('VERB');
    expect(guessPartOfSpeech('just', 'I just know').pos).not.toBe('VERB');
    expect(guessPartOfSpeech('always', 'we always fall').pos).not.toBe('VERB');
  });

  it('leaves a possessive determiner reading a noun', () => {
    // "my"/"your" are determiners, not subject pronouns — the sets must not
    // overlap or "my love" would become a verb.
    expect(guessPartOfSpeech('love', 'my love is gone').pos).toBe('NOUN');
  });
});
