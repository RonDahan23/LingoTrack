import { describe, expect, it } from 'vitest';

import {
  parseDictionarySenses,
  selectSense,
  type WordSenses,
} from '../src/services/translation/senses.js';

/**
 * The dictionary block is what makes a word lookup context-aware, so the
 * cases that matter are the ones from real lyrics: a word whose first sense is
 * the wrong part of speech, and every way the block can be missing.
 */

/** Shape Google actually returns for "tear". */
const TEAR = [
  [['דִמעָה', 'tear', null, null, 2]],
  [
    ['noun', ['דִמעָה', 'קֶרַע', 'דֶמַע'], null, null, 3],
    ['verb', ['לִקְרוֹעַ', 'לִתְלוֹשׁ', 'לְשַׁסֵעַ'], null, null, 3],
  ],
  'en',
];

describe('parseDictionarySenses', () => {
  it('reads the primary translation and every sense group', () => {
    const parsed = parseDictionarySenses(TEAR);
    expect(parsed.primary).toBe('דִמעָה');
    expect(parsed.senses.map((s) => s.pos)).toEqual(['NOUN', 'VERB']);
    expect(parsed.senses[1]?.translations[0]).toBe('לִקְרוֹעַ');
  });

  it('maps labels outside our enum onto OTHER rather than dropping them', () => {
    const body = [[['אוף', 'ugh', null, null, 2]], [['interjection', ['אוף'], null, null, 3]], 'en'];
    expect(parseDictionarySenses(body).senses[0]?.pos).toBe('OTHER');
  });

  it('returns the primary with no senses when the dictionary block is absent', () => {
    // Multi-word input gets no dictionary block at all — must not throw.
    const body = [[['חדר ללא גג', 'a room without a roof', null, null, 3]], null, 'en'];
    const parsed = parseDictionarySenses(body);
    expect(parsed.primary).toBe('חדר ללא גג');
    expect(parsed.senses).toEqual([]);
  });

  it('skips malformed sense entries instead of failing the whole parse', () => {
    const body = [[['x', 'x', null, null, 2]], [['noun'], null, ['verb', ['לִקְרוֹעַ']]], 'en'];
    expect(parseDictionarySenses(body).senses.map((s) => s.label)).toEqual(['verb']);
  });

  it('survives a completely unexpected body', () => {
    expect(parseDictionarySenses(null)).toEqual({ primary: '', senses: [] });
    expect(parseDictionarySenses({ error: 'nope' })).toEqual({ primary: '', senses: [] });
  });
});

describe('selectSense', () => {
  const senses: WordSenses = parseDictionarySenses(TEAR);

  it('picks the sense matching the part of speech from the lyric line', () => {
    // "and tore you open" -> VERB -> the sense the old lookup never reached.
    expect(selectSense(senses, 'VERB')).toBe('לִקְרוֹעַ');
    expect(selectSense(senses, 'NOUN')).toBe('דִמעָה');
  });

  it('falls back to the primary when the part of speech is unknown', () => {
    // A confident wrong sense is worse than the answer every other tool gives.
    expect(selectSense(senses, 'UNKNOWN')).toBe('דִמעָה');
    expect(selectSense(senses, 'OTHER')).toBe('דִמעָה');
  });

  it('falls back to the primary when that part of speech has no entry', () => {
    expect(selectSense(senses, 'ADVERB')).toBe('דִמעָה');
  });

  it('falls back to the primary when there is no dictionary block', () => {
    expect(selectSense({ primary: 'שלום', senses: [] }, 'NOUN')).toBe('שלום');
  });
});
