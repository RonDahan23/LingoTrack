import { describe, expect, it } from 'vitest';

import { findPhraseAt } from './phrases';
import { v } from './phraseLexicon';
import { tokenizeLine } from './wordTokenize';

/** Index of the nth word token in a tokenised line. */
function wordIndex(line: string, word: string): number {
  const tokens = tokenizeLine(line);
  return tokens.findIndex((t) => t.isWord && t.text.toLowerCase() === word.toLowerCase());
}

function matchIn(line: string, word: string) {
  return findPhraseAt(tokenizeLine(line), wordIndex(line, word));
}

describe('v', () => {
  it('generates the regular forms', () => {
    expect(v('clap').split('|').sort()).toEqual(['clap', 'clapped', 'clapping', 'claps']);
  });

  it('doubles the final consonant on single-syllable CVC verbs', () => {
    // "sliping" would never match a lyric.
    expect(v('slip')).toContain('slipping');
    expect(v('slip')).toContain('slipped');
  });

  it('does not double a final consonant after two vowels', () => {
    expect(v('reach')).toContain('reaching');
    expect(v('reach')).not.toContain('reachhing');
  });

  it('uses the supplied irregular past instead of inventing one', () => {
    const forms = v('lay', 'laid').split('|');
    expect(forms).toContain('laid');
    expect(forms).not.toContain('layed');
  });

  it('handles -e and -y stems', () => {
    expect(v('settle')).toContain('settling');
    expect(v('carry')).toContain('carries');
    expect(v('carry')).toContain('carried');
  });
});

describe('findPhraseAt', () => {
  it('matches an idiom from any word inside it', () => {
    const line = "No offense to you don't waste your time";
    expect(matchIn(line, 'no')?.text).toBe('No offense');
    expect(matchIn(line, 'offense')?.text).toBe('No offense');
  });

  it('gives the curated Hebrew for an idiom the machine mistranslates', () => {
    // Google renders this as "ללא עבירה" — without a crime.
    expect(matchIn('No offense to you', 'offense')?.translation).toBe('בלי להעליב');
  });

  it('leaves translation null for a compositional phrase', () => {
    // The caller translates the span text through the normal API instead.
    const match = matchIn('Clap along if you feel like a room', 'along');
    expect(match?.text).toBe('Clap along');
    expect(match?.translation).toBeNull();
  });

  it('matches an inflected verb in the phrase', () => {
    const match = matchIn('The way you laid your eyes on me', 'laid');
    expect(match?.text).toBe('laid your eyes on');
  });

  it('matches the same phrase without the optional determiner', () => {
    expect(matchIn('You lay eyes on me', 'eyes')?.text).toBe('lay eyes on');
  });

  it('returns the span covering the tapped word, so the highlight is exact', () => {
    const line = 'The way you laid your eyes on me';
    const tokens = tokenizeLine(line);
    const match = findPhraseAt(tokens, wordIndex(line, 'eyes'));
    expect(tokens.slice(match!.start, match!.end).map((t) => t.text).join('')).toBe(
      'laid your eyes on',
    );
  });

  it('prefers the longest phrase when several match', () => {
    // "all along" (2 words) must not win over a longer span covering the tap.
    const match = matchIn('I have been out of my mind', 'mind');
    expect(match?.text).toBe('out of my mind');
  });

  it('returns null for a word in no phrase', () => {
    expect(matchIn('Silence screaming over your words', 'words')).toBeNull();
    expect(matchIn('I never did you right, I know that', 'never')).toBeNull();
  });

  it('returns null for a separator token', () => {
    const tokens = tokenizeLine('hold on');
    const spaceIndex = tokens.findIndex((t) => !t.isWord);
    expect(findPhraseAt(tokens, spaceIndex)).toBeNull();
  });

  it('is case-insensitive and tolerates a curly apostrophe', () => {
    expect(matchIn('HOLD ON tight', 'HOLD')?.translation).toBe('להחזיק מעמד, לחכות');
    expect(matchIn('don’t give up now', 'give')?.text).toBe('give up');
  });

  it('never matches a single word as a phrase', () => {
    // No particle beside it, so there is nothing to pair "sky" with.
    expect(matchIn('under the wide sky', 'sky')).toBeNull();
  });
});

describe('findPhraseAt: generic verb + particle', () => {
  it('finds a phrasal verb the lexicon does not list', () => {
    // The reported bug: tapping "fired" gave לִירוֹת, to shoot.
    const line = "I'm fired up and tired of the way that things have been";
    expect(matchIn(line, 'fired')?.text).toBe('fired up');
    expect(matchIn(line, 'up')?.text).toBe('fired up');
  });

  it('prefers the curated gloss when the lexicon does list it', () => {
    expect(matchIn("I'm fired up", 'fired')?.translation).toBe('נלהב, מלא מרץ');
  });

  it('leaves an unlisted phrase to the translation API', () => {
    expect(matchIn('walking along the road', 'along')?.text).toBe('walking along');
    expect(matchIn('walking along the road', 'along')?.translation).toBeNull();
  });

  it('matches an explicit entry built on "to", which is not a particle', () => {
    const m = matchIn('What I tend to do when it comes to you', 'tend');
    expect(m?.text).toBe('tend to');
    expect(m?.translation).toBe('נוטה ל־, נוטה');
  });

  it('does not treat a general preposition as a particle', () => {
    // Admitting "of" would make this a phrase.
    expect(matchIn('king of the world', 'king')).toBeNull();
    expect(matchIn('tired of the way', 'tired')).toBeNull();
  });

  it('does not let a function word head a phrase', () => {
    // "I'm back", "that's on me" — subject + particle is not a phrasal verb.
    expect(matchIn("I'm back on my feet", 'back')).toBeNull();
    expect(matchIn("that's on me", 'on')).toBeNull();
    expect(matchIn('the way that things have been', 'that')).toBeNull();
  });
});
