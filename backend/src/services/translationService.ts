import { prisma } from '../lib/prisma.js';

/**
 * English → Hebrew translation for the player's word taps and per-line
 * translate button, backed by MyMemory (https://mymemory.translated.net) — a
 * free, key-less API. Results are cached in the `Translation` table so repeated
 * taps of the same word never re-hit the rate-limited API.
 */

const TARGET = 'he';
const MYMEMORY = 'https://api.mymemory.translated.net/get';

/** Cap the source length: MyMemory rejects very long queries, and lyric lines
 *  are short anyway. */
const MAX_SOURCE_LENGTH = 500;

export class TranslationError extends Error {}

interface MyMemoryResponse {
  responseStatus: number | string;
  responseData?: { translatedText?: string };
}

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function translateToHebrew(rawText: string): Promise<string> {
  const source = normalise(rawText).slice(0, MAX_SOURCE_LENGTH);
  if (!source) return '';

  const cached = await prisma.translation.findUnique({
    where: { source_target: { source, target: TARGET } },
  });
  if (cached) return cached.translated;

  const translated = await fetchFromMyMemory(source);

  // Upsert (not create) to tolerate a concurrent write for the same word.
  await prisma.translation.upsert({
    where: { source_target: { source, target: TARGET } },
    create: { source, target: TARGET, translated },
    update: { translated },
  });

  return translated;
}

async function fetchFromMyMemory(source: string): Promise<string> {
  const params = new URLSearchParams({ q: source, langpair: `en|${TARGET}` });

  let response: Response;
  try {
    response = await fetch(`${MYMEMORY}?${params.toString()}`);
  } catch {
    throw new TranslationError('Translation service is unreachable');
  }

  if (!response.ok) {
    throw new TranslationError(`Translation service returned ${response.status}`);
  }

  const body = (await response.json()) as MyMemoryResponse;
  const text = body.responseData?.translatedText?.trim();
  if (!text) throw new TranslationError('No translation returned');

  return text;
}
