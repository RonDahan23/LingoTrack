/**
 * Lemmatisation and root extraction — pure, no I/O.
 *
 * `lemmatize` undoes INFLECTION ("climbing" -> "climb"); `deriveRoot` undoes
 * DERIVATION ("climber" -> "climb", "happiness" -> "happy"). They're separate
 * because the word bank stores both: the lemma is what gets conjugated, the
 * root is what ties a whole family together.
 *
 * Candidate forms are validated against the CEFR lexicon plus the irregular
 * tables. That lexicon is only a seed, so a failed lookup is not evidence of a
 * bad candidate — it just means we fall back to rule order instead of
 * confirmation. Never let a miss throw.
 */

import { lookupCefrLevel } from '../../config/cefr.js';
import type { PartOfSpeech } from '../../config/wordBank.js';
import { isCommonStem, isNonDerived } from './commonWords.js';
import { baseOfIrregularForm, lookupIrregularVerb } from './irregulars.js';

/** True when the word appears in a curated list we trust. */
export function isKnownWord(word: string): boolean {
  return (
    lookupCefrLevel(word) !== null || lookupIrregularVerb(word) !== null || isCommonStem(word)
  );
}

/** Returns the first candidate that's a known word, else null. */
function firstKnown(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate.length >= 2 && isKnownWord(candidate)) return candidate;
  }
  return null;
}

/** Undoes a doubled final consonant: "running" -> "run" (after -ing strip). */
function undouble(stem: string): string | null {
  if (stem.length < 3) return null;
  const last = stem[stem.length - 1] as string;
  const prev = stem[stem.length - 2] as string;
  return last === prev ? stem.slice(0, -1) : null;
}

/** Candidate bases for a stem produced by stripping a vowel suffix. */
function vowelSuffixCandidates(stem: string): string[] {
  const candidates = [stem, `${stem}e`];
  const undoubled = undouble(stem);
  if (undoubled) candidates.push(undoubled);
  return candidates;
}

/**
 * Consonants that legitimately appear doubled at the end of an English base
 * form ("miss", "fill", "off", "buzz"). Any OTHER doubled ending — "stopp",
 * "runn", "begg" — is an artefact of stripping a suffix off a doubled stem.
 */
const LEGITIMATE_FINAL_DOUBLES = new Set(['s', 'l', 'f', 'z', 'e', 'o']);

/**
 * Best guess when no candidate could be confirmed against a word list.
 *
 * The curated lists are seeds, so a miss means "unconfirmed", not "wrong" — we
 * still have to return something. Undoubling is the safer default for an
 * implausible doubled ending, since no English base form ends "-pp"/"-nn".
 */
function bestGuessStem(stem: string): string {
  const last = stem[stem.length - 1] as string;
  if (!LEGITIMATE_FINAL_DOUBLES.has(last)) {
    const undoubled = undouble(stem);
    if (undoubled) return undoubled;
  }
  return stem;
}

/**
 * Reduces an inflected surface form to its base form.
 *
 * `pos` steers which suffix rules apply; pass UNKNOWN to try verb rules then
 * noun rules, which is the right default for lyric vocabulary.
 */
export function lemmatize(word: string, pos: PartOfSpeech = 'UNKNOWN'): string {
  const target = word.toLowerCase().trim();
  if (target.length < 2) return target;

  // Irregulars first — no rule can recover "went" -> "go".
  const irregularBase = baseOfIrregularForm(target);
  if (irregularBase) return irregularBase;

  // Already a known base form: don't strip a suffix off "grass" or "class".
  if (lookupIrregularVerb(target)) return target;

  switch (pos) {
    case 'VERB':
      return lemmatizeVerb(target);
    case 'NOUN':
      return lemmatizeNoun(target);
    case 'ADJECTIVE':
      return lemmatizeAdjective(target);
    case 'ADVERB':
      return lemmatizeAdverb(target);
    default:
      // Try the shape-appropriate rule, then fall back across categories.
      if (target.endsWith('ing') || target.endsWith('ed')) return lemmatizeVerb(target);
      if (target.endsWith('ly')) return lemmatizeAdverb(target);
      if (target.endsWith('er') || target.endsWith('est')) return lemmatizeAdjective(target);
      return lemmatizeNoun(target);
  }
}

function lemmatizeVerb(word: string): string {
  if (word.endsWith('ing') && word.length > 4) {
    const stem = word.slice(0, -3);
    // "dying" -> "die"
    if (stem.endsWith('y') && stem.length >= 2) {
      const ieForm = `${stem.slice(0, -1)}ie`;
      if (isKnownWord(ieForm)) return ieForm;
    }
    return firstKnown(vowelSuffixCandidates(stem)) ?? bestGuessStem(stem);
  }
  if (word.endsWith('ied') && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith('ed') && word.length > 3) {
    const stem = word.slice(0, -2);
    return firstKnown(vowelSuffixCandidates(stem)) ?? bestGuessStem(stem);
  }
  if (word.endsWith('ies') && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith('es') && word.length > 3) {
    const stem = word.slice(0, -2);
    return firstKnown([stem, `${stem}e`, word.slice(0, -1)]) ?? stem;
  }
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) {
    return word.slice(0, -1);
  }
  return word;
}

function lemmatizeNoun(word: string): string {
  if (word.endsWith('ies') && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  // "lives" -> "life", "knives" -> "knife"
  if (word.endsWith('ves') && word.length > 4) {
    const stem = word.slice(0, -3);
    return firstKnown([`${stem}f`, `${stem}fe`]) ?? `${stem}f`;
  }
  if (word.endsWith('es') && word.length > 3) {
    const stem = word.slice(0, -2);
    // "boxes" -> "box" but "names" -> "name"
    if (/(?:s|sh|ch|x|z|o)$/.test(stem)) return stem;
    return firstKnown([word.slice(0, -1), stem]) ?? word.slice(0, -1);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && word.length > 2) {
    return word.slice(0, -1);
  }
  return word;
}

function lemmatizeAdjective(word: string): string {
  if (word.endsWith('iest') && word.length > 5) return `${word.slice(0, -4)}y`;
  if (word.endsWith('ier') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('est') && word.length > 4) {
    const stem = word.slice(0, -3);
    return firstKnown(vowelSuffixCandidates(stem)) ?? bestGuessStem(stem);
  }
  if (word.endsWith('er') && word.length > 3) {
    const stem = word.slice(0, -2);
    return firstKnown(vowelSuffixCandidates(stem)) ?? bestGuessStem(stem);
  }
  return word;
}

function lemmatizeAdverb(word: string): string {
  if (!word.endsWith('ly') || word.length <= 3) return word;
  const stem = word.slice(0, -2);
  // "happily" -> "happy"
  if (stem.endsWith('i')) return `${stem.slice(0, -1)}y`;
  // "simply" -> "simple", "terribly" -> "terrible"
  if (stem.endsWith('b') || stem.endsWith('p')) {
    const leForm = `${stem}le`;
    if (isKnownWord(leForm)) return leForm;
  }
  // "basically" -> "basic"
  if (stem.endsWith('al') && isKnownWord(stem.slice(0, -2))) return stem.slice(0, -2);
  return firstKnown([stem, `${stem}e`]) ?? stem;
}

/**
 * Derivational suffixes, longest first. Each entry maps a suffix to the
 * replacement applied to the remaining stem.
 */
const DERIVATIONAL: readonly { suffix: string; replace: string }[] = [
  { suffix: 'iness', replace: 'y' },
  { suffix: 'ness', replace: '' },
  { suffix: 'ment', replace: '' },
  { suffix: 'ation', replace: 'e' },
  { suffix: 'ition', replace: 'ite' },
  { suffix: 'tion', replace: 't' },
  { suffix: 'sion', replace: 'd' },
  { suffix: 'ity', replace: '' },
  { suffix: 'ship', replace: '' },
  { suffix: 'hood', replace: '' },
  { suffix: 'ful', replace: '' },
  { suffix: 'less', replace: '' },
  { suffix: 'ous', replace: '' },
  { suffix: 'ist', replace: '' },
  { suffix: 'ism', replace: '' },
  { suffix: 'er', replace: '' },
  { suffix: 'or', replace: '' },
  { suffix: 'ly', replace: '' },
];

/**
 * Strips derivational morphology to find the family root: "climber" -> "climb",
 * "happiness" -> "happy", "hopeless" -> "hope".
 *
 * Only accepts a stripped candidate that's a known word — otherwise "water"
 * would lose its "-er" and become "wat". Returns the lemma unchanged when no
 * confident reduction exists, which is the common and correct case.
 */
export function deriveRoot(lemma: string): string {
  const target = lemma.toLowerCase().trim();
  if (target.length < 4) return target;
  // Words that merely look derivational are exempt — this is what stops "water"
  // losing its "-er" and "family" its "-ly". Genuinely derived common words
  // ("hopeless", "climber") are NOT exempt and still reduce below.
  if (isNonDerived(target)) return target;

  for (const rule of DERIVATIONAL) {
    if (!target.endsWith(rule.suffix)) continue;
    const stem = target.slice(0, -rule.suffix.length);
    if (stem.length < 3) continue;

    const candidates = [`${stem}${rule.replace}`, stem, `${stem}e`];
    const undoubled = undouble(stem);
    if (undoubled) candidates.push(undoubled);

    const known = firstKnown(candidates);
    if (known && known !== target) return known;
  }
  return target;
}
