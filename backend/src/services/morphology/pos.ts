/**
 * Part-of-speech inference — pure, no I/O, no model.
 *
 * Two signals, in priority order:
 *   1. Syntactic context from the lyric line the word was tapped in ("to
 *      climb" -> verb, "the climb" -> noun). Strongest evidence available, and
 *      free: the player already knows the line.
 *   2. Suffix shape ("-ness" -> noun, "-ly" -> adverb).
 *
 * Returns UNKNOWN rather than guessing wildly — downstream code treats UNKNOWN
 * as "inflect conservatively", which is better than confidently teaching a
 * bogus conjugation.
 */

import type { PartOfSpeech } from '../../config/wordBank.js';
import { isKnownVerb } from './irregulars.js';
import { tokenize } from '../grading/tokenizer.js';

export interface PosGuess {
  pos: PartOfSpeech;
  /** How much to trust it. Drives whether enrich.ts generates a full family. */
  confidence: 'high' | 'medium' | 'low';
}

const DETERMINERS = new Set([
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this',
  'that', 'these', 'those', 'every', 'each', 'no', 'some', 'any',
]);

const MODALS = new Set([
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  "don't", "won't", "can't", 'dont', 'wont', 'cant', 'let', "let's", 'lets',
]);

const BE_FORMS = new Set(['is', 'are', 'was', 'were', 'am', 'be', 'been', 'being']);
const HAVE_FORMS = new Set(['have', 'has', 'had']);
const DEGREE_ADVERBS = new Set(['very', 'so', 'too', 'quite', 'really', 'more', 'most', 'less']);

/** Common -ly words that are NOT adverbs. */
const LY_EXCEPTIONS = new Set([
  'only', 'family', 'reply', 'apply', 'supply', 'rely', 'fly', 'july', 'ally',
  'multiply', 'imply', 'holy', 'ugly', 'lonely', 'lovely', 'silly', 'early',
  'friendly', 'likely', 'daily', 'jelly', 'belly', 'rally', 'bully',
]);

/** Suffix -> part of speech, checked longest-first so "-ation" beats "-on". */
const SUFFIX_RULES: readonly { suffix: string; pos: PartOfSpeech }[] = [
  { suffix: 'ness', pos: 'NOUN' },
  { suffix: 'ment', pos: 'NOUN' },
  { suffix: 'tion', pos: 'NOUN' },
  { suffix: 'sion', pos: 'NOUN' },
  { suffix: 'ship', pos: 'NOUN' },
  { suffix: 'hood', pos: 'NOUN' },
  { suffix: 'ance', pos: 'NOUN' },
  { suffix: 'ence', pos: 'NOUN' },
  { suffix: 'ity', pos: 'NOUN' },
  { suffix: 'ist', pos: 'NOUN' },
  { suffix: 'ism', pos: 'NOUN' },
  { suffix: 'able', pos: 'ADJECTIVE' },
  { suffix: 'ible', pos: 'ADJECTIVE' },
  { suffix: 'ful', pos: 'ADJECTIVE' },
  { suffix: 'less', pos: 'ADJECTIVE' },
  { suffix: 'ous', pos: 'ADJECTIVE' },
  { suffix: 'ive', pos: 'ADJECTIVE' },
  { suffix: 'ish', pos: 'ADJECTIVE' },
  { suffix: 'ify', pos: 'VERB' },
  { suffix: 'ise', pos: 'VERB' },
  { suffix: 'ize', pos: 'VERB' },
];

/**
 * Infers the part of speech of `word` as used in `contextLine`.
 *
 * `word` must already be normalised (lower-cased, punctuation-stripped) — pass
 * output of tokenize().
 */
export function guessPartOfSpeech(word: string, contextLine?: string | null): PosGuess {
  const target = word.toLowerCase().trim();
  if (!target) return { pos: 'UNKNOWN', confidence: 'low' };

  const contextual = fromContext(target, contextLine);
  if (contextual) return contextual;

  // Known irregular verb in any form — very strong signal.
  if (isKnownVerb(target)) return { pos: 'VERB', confidence: 'high' };

  return fromShape(target);
}

/** Syntactic evidence from the surrounding words. */
function fromContext(word: string, contextLine?: string | null): PosGuess | null {
  if (!contextLine) return null;
  const tokens = tokenize(contextLine);
  const index = tokens.indexOf(word);
  if (index === -1) return null;

  const prev = index > 0 ? (tokens[index - 1] as string) : null;
  const prev2 = index > 1 ? (tokens[index - 2] as string) : null;

  if (prev === 'to' && !word.endsWith('ing')) return { pos: 'VERB', confidence: 'high' };
  if (prev && MODALS.has(prev)) return { pos: 'VERB', confidence: 'high' };
  if (prev && HAVE_FORMS.has(prev)) return { pos: 'VERB', confidence: 'high' };
  if (prev && BE_FORMS.has(prev) && word.endsWith('ing')) {
    return { pos: 'VERB', confidence: 'high' };
  }
  // "is beautiful" — a bare adjective after a copula.
  if (prev && BE_FORMS.has(prev) && !word.endsWith('ing') && !word.endsWith('ed')) {
    return { pos: 'ADJECTIVE', confidence: 'medium' };
  }
  if (prev && DETERMINERS.has(prev)) return { pos: 'NOUN', confidence: 'high' };
  // "the dark night" — determiner two back means this is likely a modifier.
  if (prev2 && DETERMINERS.has(prev2) && prev && !DEGREE_ADVERBS.has(prev)) {
    return { pos: 'ADJECTIVE', confidence: 'low' };
  }
  if (prev && DEGREE_ADVERBS.has(prev)) return { pos: 'ADJECTIVE', confidence: 'medium' };

  return null;
}

/** Morphological shape — weaker, but always available. */
function fromShape(word: string): PosGuess {
  if (word.endsWith('ly') && !LY_EXCEPTIONS.has(word) && word.length > 4) {
    return { pos: 'ADVERB', confidence: 'medium' };
  }
  for (const rule of SUFFIX_RULES) {
    if (word.endsWith(rule.suffix) && word.length > rule.suffix.length + 1) {
      return { pos: rule.pos, confidence: 'medium' };
    }
  }
  // -ing/-ed are verb-shaped, but "-ing" is also how gerund nouns look, so the
  // confidence stays medium and enrich.ts still produces the verb family (which
  // is the useful thing to teach either way).
  if (word.endsWith('ing') && word.length > 5) return { pos: 'VERB', confidence: 'medium' };
  if (word.endsWith('ed') && word.length > 4) return { pos: 'VERB', confidence: 'medium' };

  return { pos: 'UNKNOWN', confidence: 'low' };
}
