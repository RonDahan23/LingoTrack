/**
 * Word enrichment — the entry point the word-bank capture path calls.
 *
 * Turns a tapped surface form plus its lyric line into the full linguistic
 * record the learner practises against: lemma, root, part of speech, CEFR
 * level, and the labelled word family.
 *
 * Pure and deterministic — no DB, no network — so the whole feature's
 * linguistics can be unit-tested without a database.
 */

import { lookupCefrLevel } from '../../config/cefr.js';
import type { CefrLevel } from '../../config/cefr.js';
import type { PartOfSpeech } from '../../config/wordBank.js';
import { tokenize } from '../grading/tokenizer.js';
import { adjectiveForms, nounForms, verbForms } from './inflect.js';
import type { WordForm } from './inflect.js';
import { deriveRoot, lemmatize } from './lemma.js';
import { guessPartOfSpeech } from './pos.js';

export interface WordEnrichment {
  /** Normalised surface form exactly as tapped, e.g. "climbing". */
  surface: string;
  /** Canonical base form the family is generated from, e.g. "climb". */
  lemma: string;
  /** Derivational root tying the family together, e.g. "climb". */
  root: string;
  partOfSpeech: PartOfSpeech;
  /** CEFR level of the lemma when known — null for words outside the seed. */
  cefrLevel: CefrLevel | null;
  /** Labelled family members, always including the lemma itself. */
  forms: WordForm[];
}

/** Normalises a raw tapped string to a single token, or '' if unusable. */
export function normaliseWord(raw: string): string {
  const tokens = tokenize(raw);
  return tokens[0] ?? '';
}

/**
 * Enriches a tapped word.
 *
 * `contextLine` is the lyric line the word came from; it materially improves
 * part-of-speech accuracy ("to climb" vs "the climb"), so pass it when known.
 * Returns null when the input contains no usable word token.
 */
export function enrichWord(raw: string, contextLine?: string | null): WordEnrichment | null {
  const surface = normaliseWord(raw);
  if (!surface) return null;

  const { pos, confidence } = guessPartOfSpeech(surface, contextLine);
  const lemma = lemmatize(surface, pos);
  const root = deriveRoot(lemma);
  const cefrLevel = lookupCefrLevel(lemma);

  return {
    surface,
    lemma,
    root,
    partOfSpeech: pos,
    cefrLevel,
    forms: buildForms(lemma, pos, confidence),
  };
}

/**
 * Generates the family for a lemma.
 *
 * When the part of speech is UNKNOWN or only weakly inferred we deliberately
 * emit a NARROWER family rather than a speculative one: showing a learner
 * "to silence / silenced / silencing" for a noun reading is worse than showing
 * only the singular/plural pair. Verb families are the exception — an -ing/-ed
 * shape is reliable enough to conjugate from even at medium confidence.
 */
function buildForms(
  lemma: string,
  pos: PartOfSpeech,
  confidence: 'high' | 'medium' | 'low',
): WordForm[] {
  switch (pos) {
    case 'VERB':
      return verbForms(lemma);
    case 'NOUN':
      return nounForms(lemma);
    case 'ADJECTIVE':
      return adjectiveForms(lemma);
    case 'ADVERB':
      // The interesting family for an adverb is its adjective's.
      return confidence === 'low'
        ? [{ form: lemma, label: 'base' }]
        : adjectiveForms(deriveRoot(lemma));
    default:
      // No idea what it is — teach the word itself and its plural, the two
      // readings that are almost always safe.
      return nounForms(lemma);
  }
}

/**
 * Flattens a family to plain surface strings, dropping multi-word entries
 * ("to climb", "more beautiful"). Used where only single tokens make sense,
 * e.g. matching a played lyric against the family.
 */
export function familyTokens(enrichment: WordEnrichment): string[] {
  const tokens = new Set<string>();
  for (const { form } of enrichment.forms) {
    if (!form.includes(' ')) tokens.add(form);
  }
  tokens.add(enrichment.surface);
  tokens.add(enrichment.lemma);
  return [...tokens];
}
