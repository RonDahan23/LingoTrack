import {
  DET,
  DETERMINERS,
  NOT_PHRASAL_HEADS,
  PARTICLES,
  PHRASES,
  type PhraseEntry,
} from './phraseLexicon';
import type { LineToken } from './wordTokenize';

/**
 * Multi-word expression detection over a lyric line.
 *
 * Tapping one word of "no offense" or "clap along" and getting that word alone
 * is worse than useless: "offense" translates to הַתקָפָה, "along" to לְאוֹרֶך,
 * and neither has anything to do with what the line says. So a tap first asks
 * whether the word sits inside a known phrase, and if it does, the whole
 * phrase is what gets shown and highlighted.
 *
 * Pure and token-index based, so the span it returns addresses exactly the
 * tokens the row rendered — the highlight can never drift from the match.
 */

export interface PhraseMatch {
  /** Index into the token array, inclusive. */
  start: number;
  /** Index into the token array, exclusive. */
  end: number;
  /** The phrase exactly as it appears in the line, separators included. */
  text: string;
  /**
   * Curated Hebrew, or null when the phrase translates compositionally and the
   * caller should ask the translation API for `text`.
   */
  translation: string | null;
}

/** Lower-cased, apostrophes normalised — lyrics use ’ as often as '. */
function normalise(word: string): string {
  return word.toLowerCase().replace(/[’]/g, "'");
}

function tokenMatches(pattern: string, word: string): boolean {
  // Alternatives are pipe-separated: "give|gives|giving|gave|given".
  return pattern.split('|').includes(word);
}

/**
 * Tries to match `entry` against the word list starting at `from`.
 * Returns the number of words consumed, or -1.
 */
function matchAt(entry: PhraseEntry, words: string[], from: number): number {
  let w = from;

  for (const slot of entry.pattern) {
    if (slot === DET) {
      // Optional: consume a determiner if one is sitting there, else skip.
      if (w < words.length && DETERMINERS.has(words[w] as string)) w += 1;
      continue;
    }
    if (w >= words.length || !tokenMatches(slot, words[w] as string)) return -1;
    w += 1;
  }

  return w - from;
}

/**
 * Finds the phrase covering the word token at `tokenIndex`, if any.
 *
 * Longest match wins, so "lay eyes on" beats a hypothetical "lay eyes"; ties
 * go to the earlier start and then to lexicon order, which keeps the result
 * deterministic for a given line rather than dependent on iteration order.
 */
/**
 * Falls back to the shape of a phrasal verb when the lexicon has no entry.
 *
 * A curated list will always be missing something — "fired up" was, and a tap
 * on it returned "fired" alone, which translates to לִירוֹת, *to shoot*. So a
 * verb immediately followed by a particle is treated as a phrase even when
 * unlisted, in both directions (tapping either half finds the pair).
 *
 * Deliberately narrow. Only true particles count, never general prepositions:
 * admitting "of" would turn "king of the world" into a phrase. And the head
 * must not be a function word, or "I'm back" and "that's on me" would match.
 * Missing a phrase costs a tap; inventing one wastes the learner's attention.
 */
function findParticlePhrase(words: string[], at: number): { start: number; length: number } | null {
  const isHead = (w: string | undefined) =>
    w !== undefined && !NOT_PHRASAL_HEADS.has(w) && !PARTICLES.has(w);

  if (PARTICLES.has(words[at + 1] as string) && isHead(words[at])) {
    return { start: at, length: 2 };
  }
  if (at > 0 && PARTICLES.has(words[at] as string) && isHead(words[at - 1])) {
    return { start: at - 1, length: 2 };
  }
  return null;
}

export function findPhraseAt(tokens: LineToken[], tokenIndex: number): PhraseMatch | null {
  const target = tokens[tokenIndex];
  if (!target?.isWord) return null;

  // Word tokens only, keeping a map back to positions in the full array.
  const positions: number[] = [];
  const words: string[] = [];
  tokens.forEach((token, i) => {
    if (token.isWord) {
      positions.push(i);
      words.push(normalise(token.text));
    }
  });

  const targetWord = positions.indexOf(tokenIndex);
  if (targetWord === -1) return null;

  let best: { startWord: number; length: number; entry: PhraseEntry } | null = null;

  for (const entry of PHRASES) {
    // A phrase can begin at most (pattern length - 1) words before the tap.
    const earliest = Math.max(0, targetWord - entry.pattern.length + 1);
    for (let start = earliest; start <= targetWord; start += 1) {
      const length = matchAt(entry, words, start);
      if (length <= 1) continue; // single words are not phrases
      if (start + length <= targetWord) continue; // span must cover the tap

      if (!best || length > best.length || (length === best.length && start < best.startWord)) {
        best = { startWord: start, length, entry };
      }
    }
  }

  // The curated lexicon wins; the generic particle rule only fills its gaps.
  if (!best) {
    const generic = findParticlePhrase(words, targetWord);
    if (!generic) return null;
    best = { startWord: generic.start, length: generic.length, entry: { pattern: [] } };
  }

  const start = positions[best.startWord] as number;
  const end = (positions[best.startWord + best.length - 1] as number) + 1;

  return {
    start,
    end,
    text: tokens.slice(start, end).map((t) => t.text).join(''),
    translation: best.entry.he ?? null,
  };
}
