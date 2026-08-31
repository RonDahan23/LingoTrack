/**
 * Rule-based English inflection — pure, deterministic, no I/O.
 *
 * Given a base form (lemma) plus a part of speech, produces the word family the
 * learner should see: "climb" -> climb / to climb / climbs / climbing / climbed
 * / climber. Irregular forms come from irregulars.ts; everything else is
 * derived by orthographic rules.
 *
 * Design note: every generator returns LABELLED forms rather than a bare string
 * list, because the quiz engine needs to ask "match the gerund to the
 * infinitive" — it must know which form is which.
 */

import {
  INVARIANT_PLURALS,
  IRREGULAR_ADVERBS,
  IRREGULAR_COMPARATIVES,
  IRREGULAR_PLURALS,
  NO_DOUBLING_VERBS,
  STRESS_DOUBLING_VERBS,
  UNCOUNTABLE_NOUNS,
  lookupIrregularVerb,
} from './irregulars.js';

/** A single member of a word family. */
export interface WordForm {
  /** The surface string, e.g. "climbing". */
  form: string;
  /** Which grammatical form this is — drives the FORM_MATCH exercise. */
  label: FormLabel;
}

export const FORM_LABELS = [
  'base',
  'infinitive',
  'third_person',
  'gerund',
  'past',
  'past_participle',
  'agent_noun',
  'singular',
  'plural',
  'comparative',
  'superlative',
  'adverb',
] as const;
export type FormLabel = (typeof FORM_LABELS)[number];

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function isVowel(ch: string): boolean {
  return VOWELS.has(ch);
}

function endsWithConsonantY(word: string): boolean {
  return word.length >= 2 && word.endsWith('y') && !isVowel(word[word.length - 2] as string);
}

/**
 * Consonant-Vowel-Consonant ending, the shape that doubles before a vowel
 * suffix ("stop" -> "stopped"). Final w/x/y never double ("play" -> "played").
 */
function endsCVC(word: string): boolean {
  if (word.length < 3) return false;
  const [c1, v, c2] = [
    word[word.length - 3] as string,
    word[word.length - 2] as string,
    word[word.length - 1] as string,
  ];
  return !isVowel(c1) && isVowel(v) && !isVowel(c2) && !['w', 'x', 'y'].includes(c2);
}

/**
 * Whether to double the final consonant before -ing/-ed/-er.
 *
 * True doubling depends on syllable stress, which can't be read off spelling.
 * The approximation: always double short CVC words (stop, run, big), double
 * known stress-final two-syllable verbs from the curated list, and never double
 * the known exceptions. Anything longer is left alone — under-doubling produces
 * a recognisable form ("travelled" vs "traveled", both attested), whereas
 * over-doubling produces nonsense.
 */
function shouldDoubleFinal(word: string): boolean {
  if (NO_DOUBLING_VERBS.has(word)) return false;
  if (STRESS_DOUBLING_VERBS.has(word)) return true;
  if (!endsCVC(word)) return false;
  // Single-syllable-ish: short words are overwhelmingly stress-final.
  return word.length <= 4;
}

function doubleFinal(word: string): string {
  return word + (word[word.length - 1] as string);
}

/** Stem used before a vowel-initial suffix (-ing, -ed, -er). */
function stemForVowelSuffix(word: string): string {
  if (shouldDoubleFinal(word)) return doubleFinal(word);
  return word;
}

// ---------------------------------------------------------------------------
// Verb forms
// ---------------------------------------------------------------------------

/** "climb" -> "climbs", "watch" -> "watches", "carry" -> "carries". */
export function thirdPerson(base: string): string {
  const irregular = lookupIrregularVerb(base);
  if (irregular?.thirdPerson) return irregular.thirdPerson;
  if (/(?:s|sh|ch|x|z|o)$/.test(base)) return `${base}es`;
  if (endsWithConsonantY(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

/** "climb" -> "climbing", "make" -> "making", "run" -> "running". */
export function gerund(base: string): string {
  const irregular = lookupIrregularVerb(base);
  if (irregular?.gerund) return irregular.gerund;
  // "die" -> "dying", "lie" -> "lying"
  if (base.endsWith('ie')) return `${base.slice(0, -2)}ying`;
  // Drop a silent final -e, but keep it in "see"/"agree"/"dye".
  if (base.endsWith('e') && !base.endsWith('ee') && !base.endsWith('oe') && !base.endsWith('ye')) {
    return `${base.slice(0, -1)}ing`;
  }
  return `${stemForVowelSuffix(base)}ing`;
}

/** "climb" -> "climbed", "hope" -> "hoped", "carry" -> "carried". */
export function pastTense(base: string): string {
  const irregular = lookupIrregularVerb(base);
  if (irregular) return irregular.past;
  if (base.endsWith('e')) return `${base}d`;
  if (endsWithConsonantY(base)) return `${base.slice(0, -1)}ied`;
  return `${stemForVowelSuffix(base)}ed`;
}

/** Past participle — identical to the past tense unless irregular. */
export function pastParticiple(base: string): string {
  const irregular = lookupIrregularVerb(base);
  if (irregular) return irregular.participle;
  return pastTense(base);
}

/**
 * Agent noun: "climb" -> "climber", "run" -> "runner", "write" -> "writer".
 *
 * Derivational rather than inflectional, so it's a plausible guess, not a
 * guarantee ("be" -> "beer" would be nonsense). Callers should only surface it
 * for verbs where it reads naturally; enrich.ts gates it on a length check.
 */
export function agentNoun(base: string): string {
  if (base.endsWith('e')) return `${base}r`;
  if (endsWithConsonantY(base)) return `${base.slice(0, -1)}ier`;
  return `${stemForVowelSuffix(base)}er`;
}

/** Full verb family for a base form. */
export function verbForms(base: string): WordForm[] {
  const forms: WordForm[] = [
    { form: base, label: 'base' },
    { form: `to ${base}`, label: 'infinitive' },
    { form: thirdPerson(base), label: 'third_person' },
    { form: gerund(base), label: 'gerund' },
    { form: pastTense(base), label: 'past' },
  ];
  const participle = pastParticiple(base);
  if (participle !== pastTense(base)) {
    forms.push({ form: participle, label: 'past_participle' });
  }
  // Agent nouns read as nonsense for very short auxiliaries ("be", "do").
  if (base.length >= 4) {
    forms.push({ form: agentNoun(base), label: 'agent_noun' });
  }
  return dedupe(forms);
}

// ---------------------------------------------------------------------------
// Noun forms
// ---------------------------------------------------------------------------

/** "song" -> "songs", "box" -> "boxes", "city" -> "cities". */
export function pluralize(singular: string): string {
  const irregular = IRREGULAR_PLURALS[singular];
  if (irregular) return irregular;
  if (INVARIANT_PLURALS.has(singular)) return singular;
  if (/(?:s|sh|ch|x|z)$/.test(singular)) return `${singular}es`;
  if (endsWithConsonantY(singular)) return `${singular.slice(0, -1)}ies`;
  return `${singular}s`;
}

export function nounForms(singular: string): WordForm[] {
  const forms: WordForm[] = [{ form: singular, label: 'singular' }];
  // A mass noun has no plural — inventing one would teach a falsehood.
  if (!UNCOUNTABLE_NOUNS.has(singular)) {
    forms.push({ form: pluralize(singular), label: 'plural' });
  }
  return dedupe(forms);
}

// ---------------------------------------------------------------------------
// Adjective / adverb forms
// ---------------------------------------------------------------------------

/** "big" -> "bigger", "happy" -> "happier", "beautiful" -> "more beautiful". */
export function comparative(base: string): string {
  const irregular = IRREGULAR_COMPARATIVES[base];
  if (irregular) return irregular.comparative;
  // Long adjectives take the periphrastic form.
  if (base.length > 7) return `more ${base}`;
  if (base.endsWith('e')) return `${base}r`;
  if (endsWithConsonantY(base)) return `${base.slice(0, -1)}ier`;
  return `${stemForVowelSuffix(base)}er`;
}

export function superlative(base: string): string {
  const irregular = IRREGULAR_COMPARATIVES[base];
  if (irregular) return irregular.superlative;
  if (base.length > 7) return `most ${base}`;
  if (base.endsWith('e')) return `${base}st`;
  if (endsWithConsonantY(base)) return `${base.slice(0, -1)}iest`;
  return `${stemForVowelSuffix(base)}est`;
}

/** "quick" -> "quickly", "happy" -> "happily", "simple" -> "simply". */
export function toAdverb(base: string): string {
  const irregular = IRREGULAR_ADVERBS[base];
  if (irregular) return irregular;
  if (endsWithConsonantY(base)) return `${base.slice(0, -1)}ily`;
  // "simple" -> "simply", "terrible" -> "terribly"
  if (base.endsWith('le') && base.length > 3 && !isVowel(base[base.length - 3] as string)) {
    return `${base.slice(0, -1)}y`;
  }
  // "basic" -> "basically", "tragic" -> "tragically"
  if (base.endsWith('ic')) return `${base}ally`;
  return `${base}ly`;
}

export function adjectiveForms(base: string): WordForm[] {
  return dedupe([
    { form: base, label: 'base' },
    { form: comparative(base), label: 'comparative' },
    { form: superlative(base), label: 'superlative' },
    { form: toAdverb(base), label: 'adverb' },
  ]);
}

/** Drops duplicate surface forms, keeping the first (most canonical) label. */
function dedupe(forms: WordForm[]): WordForm[] {
  const seen = new Set<string>();
  const out: WordForm[] = [];
  for (const entry of forms) {
    if (seen.has(entry.form)) continue;
    seen.add(entry.form);
    out.push(entry);
  }
  return out;
}
