/**
 * Context-aware lookup for a tapped word.
 *
 * The plain translation endpoint answers "what does this string mean", which
 * for a lone word is whatever sense Google ranks first. In lyrics that is
 * wrong often enough to mislead: "tear" in *and tore you open* came back as
 * דִמעָה, and "laid" as מוּנָח rather than לְהַנִיחַ.
 *
 * So the lyric line is used twice. `enrichWord` infers the part of speech from
 * it and reduces the surface form to its lemma; `selectSense` then picks the
 * dictionary sense matching that part of speech. Every step degrades to the
 * old behaviour rather than failing — an unknown part of speech, a word with
 * no dictionary block, or a total sense-lookup outage all end at the plain
 * translation.
 */

import { prisma } from '../lib/prisma.js';
import type { PartOfSpeech } from '../config/wordBank.js';
import { enrichWord } from './morphology/enrich.js';
import { TranslationError, translateToHebrew } from './translationService.js';
import { looksUntranslated } from './translation/providers.js';
import {
  fetchWordSenses,
  selectSense,
  type WordSense,
  type WordSenses,
} from './translation/senses.js';

const TARGET = 'he';

export interface WordLookup {
  /** Normalised surface form, as tapped. */
  word: string;
  lemma: string;
  partOfSpeech: PartOfSpeech;
  /** The sense-resolved translation — what the player shows. */
  translation: string;
  /** Every sense, so the popover can offer the alternatives. */
  senses: WordSense[];
}

/**
 * Senses are cached in the `Translation` table under a namespaced key.
 *
 * One row per lemma rather than per (lemma, part of speech): the senses are a
 * property of the word, and the part of speech only selects among them. The
 * same cached row therefore serves "tear" the noun and "tear" the verb, and
 * a word looked up in a new context costs no request at all.
 *
 * The prefix keeps these rows from colliding with plain translations, whose
 * key is the source text itself — `tear` and `senses#tear` are distinct.
 */
function sensesCacheKey(lemma: string): string {
  return `senses#${lemma}`;
}

function parseCached(raw: string): WordSenses | null {
  try {
    const parsed = JSON.parse(raw) as WordSenses;
    // A row written by an older shape (or a plain string) must not be trusted.
    if (typeof parsed?.primary !== 'string' || !Array.isArray(parsed?.senses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function cachedSenses(lemma: string): Promise<WordSenses> {
  const source = sensesCacheKey(lemma);

  const cached = await prisma.translation.findUnique({
    where: { source_target: { source, target: TARGET } },
  });
  const parsed = cached ? parseCached(cached.translated) : null;
  // Rows cached before the echo guard existed may hold a non-answer; re-fetch
  // over them rather than serving them forever.
  if (parsed && !looksUntranslated(lemma, parsed.primary)) return parsed;

  const senses = await fetchWordSenses(lemma, TARGET);

  // Google echoes what it cannot translate. Caching that would pin a non-answer
  // to this lemma permanently, so treat it as a provider failure and let the
  // caller fall through to the plain translation path.
  if (looksUntranslated(lemma, senses.primary)) {
    throw new TranslationError(`senses echoed the source for "${lemma}"`);
  }

  await prisma.translation.upsert({
    where: { source_target: { source, target: TARGET } },
    create: { source, target: TARGET, translated: JSON.stringify(senses) },
    update: { translated: JSON.stringify(senses) },
  });

  return senses;
}

/**
 * Looks a word up in the context of the line it was tapped in.
 *
 * `contextLine` is optional but materially changes the answer — without it the
 * part of speech falls back to suffix shape alone, which cannot tell a "tear"
 * you cry from one you make.
 */
export async function lookupWord(raw: string, contextLine?: string | null): Promise<WordLookup> {
  const enrichment = enrichWord(raw, contextLine ?? null);

  // Not a usable word token (punctuation, empty) — translate it as plain text
  // so the caller still gets an answer rather than an error.
  if (!enrichment) {
    return {
      word: raw.trim(),
      lemma: raw.trim(),
      partOfSpeech: 'UNKNOWN',
      translation: await translateToHebrew(raw),
      senses: [],
    };
  }

  const { surface, lemma, partOfSpeech } = enrichment;

  try {
    const senses = await cachedSenses(lemma);
    const translation = selectSense(senses, partOfSpeech);
    if (translation) {
      return { word: surface, lemma, partOfSpeech, translation, senses: senses.senses };
    }
  } catch (err) {
    // Only a provider failure falls back; a bug in our own parsing should not
    // be hidden behind a quietly worse answer.
    if (!(err instanceof TranslationError)) throw err;
  }

  return {
    word: surface,
    lemma,
    partOfSpeech,
    translation: await translateToHebrew(lemma),
    senses: [],
  };
}
