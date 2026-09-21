/**
 * Dictionary senses for a single English word, grouped by part of speech.
 *
 * Why this exists: translating a bare word returns Google's single most
 * common sense, which is wrong often enough to be misleading in lyrics.
 * "tear" comes back as דִמעָה even in "and tore you open", and "lay" as the
 * adjective מוּנָח rather than the verb לְהַנִיחַ. The dictionary block
 * (`dt=bd`) returns every sense split by part of speech, and the word bank
 * already infers a word's part of speech from the line it was tapped in — so
 * the right sense is selectable rather than guessable.
 *
 * Same availability problem as plain translation, same answer: several hosts
 * are tried in turn. The response envelope is identical across them.
 */

import type { PartOfSpeech } from '../../config/wordBank.js';
import { TranslationError } from './providers.js';

const REQUEST_TIMEOUT_MS = 6_000;

export interface WordSense {
  /** Part of speech as Google labels it, already mapped onto ours. */
  pos: PartOfSpeech;
  /** Google's own label, kept for display ("noun", "verb", …). */
  label: string;
  /** Most common first — Google returns them ranked. */
  translations: string[];
}

export interface WordSenses {
  /** The plain translation, i.e. what the old single-sense lookup returned. */
  primary: string;
  senses: WordSense[];
}

/** Google's dictionary labels → our part-of-speech enum. */
const POS_BY_LABEL: Record<string, PartOfSpeech> = {
  noun: 'NOUN',
  verb: 'VERB',
  adjective: 'ADJECTIVE',
  adverb: 'ADVERB',
  pronoun: 'OTHER',
  preposition: 'OTHER',
  conjunction: 'OTHER',
  interjection: 'OTHER',
  exclamation: 'OTHER',
  abbreviation: 'OTHER',
  prefix: 'OTHER',
  suffix: 'OTHER',
};

/**
 * Reads `[ [sentences…], [ [posLabel, [translations…], …], … ], … ]`.
 *
 * Tolerant by design: a missing or reshaped dictionary block yields an empty
 * `senses` list and the caller falls back to the plain translation, rather
 * than the whole word lookup failing because Google changed a nested index.
 */
export function parseDictionarySenses(body: unknown): WordSenses {
  const root = Array.isArray(body) ? body : [];

  const primary = Array.isArray(root[0])
    ? (root[0] as unknown[])
        .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : ''))
        .join('')
        .trim()
    : '';

  const block = root[1];
  if (!Array.isArray(block)) return { primary, senses: [] };

  const senses: WordSense[] = [];
  for (const entry of block) {
    if (!Array.isArray(entry)) continue;
    const label = typeof entry[0] === 'string' ? entry[0].toLowerCase() : '';
    const translations = Array.isArray(entry[1])
      ? (entry[1] as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : [];
    if (!label || translations.length === 0) continue;

    senses.push({ pos: POS_BY_LABEL[label] ?? 'OTHER', label, translations });
  }

  return { primary, senses };
}

/**
 * Picks the translation to show for a word whose part of speech is known.
 *
 * Falls back to `primary` when the part of speech is unknown or absent from
 * the dictionary — a confident wrong sense is worse than Google's default,
 * which at least matches what every other translation tool would say.
 */
export function selectSense(senses: WordSenses, pos: PartOfSpeech): string {
  if (pos === 'UNKNOWN' || pos === 'OTHER') return senses.primary;

  const match = senses.senses.find((s) => s.pos === pos);
  return match?.translations[0] ?? senses.primary;
}

/** Hosts serving the same endpoint, tried in order — see providers.ts. */
const SENSE_ENDPOINTS: readonly { host: string; client: string }[] = [
  { host: 'clients5.google.com', client: 'dict-chrome-ex' },
  { host: 'translate.googleapis.com', client: 'dict-chrome-ex' },
  { host: 'translate.googleapis.com', client: 'gtx' },
];

async function fetchSensesFrom(
  endpoint: { host: string; client: string },
  word: string,
  target: string,
): Promise<WordSenses> {
  const params = new URLSearchParams({ client: endpoint.client, sl: 'en', tl: target, q: word });
  // dt=t is the sentence translation, dt=bd the dictionary block.
  const url = `https://${endpoint.host}/translate_a/single?${params.toString()}&dt=t&dt=bd`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new TranslationError(`senses(${endpoint.host}) unreachable`);
  }
  if (!response.ok) {
    throw new TranslationError(`senses(${endpoint.host}) returned ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new TranslationError(`senses(${endpoint.host}) returned a non-JSON body`);
  }

  const parsed = parseDictionarySenses(body);
  if (!parsed.primary) throw new TranslationError(`senses(${endpoint.host}) returned no translation`);
  return parsed;
}

/** Walks the hosts; throws TranslationError only if every one fails. */
export async function fetchWordSenses(word: string, target: string): Promise<WordSenses> {
  const failures: string[] = [];

  for (const endpoint of SENSE_ENDPOINTS) {
    try {
      return await fetchSensesFrom(endpoint, word, target);
    } catch (err) {
      if (!(err instanceof TranslationError)) throw err;
      failures.push(err.message);
    }
  }

  throw new TranslationError(`All sense lookups failed (${failures.join('; ')})`);
}
