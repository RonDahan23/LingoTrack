import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import {
  TranslationError,
  createMyMemoryProvider,
  googleMobileProvider,
  googleProvider,
  looksLikeProviderWarning,
  type TranslationProvider,
} from './translation/providers.js';

/**
 * English → Hebrew translation for the player's word taps and per-line
 * translate button. Results are cached in the `Translation` table so repeated
 * taps of the same word never re-hit the (rate-limited) upstream APIs.
 *
 * The upstream call itself lives in `translation/providers.ts`, which walks a
 * chain rather than a single API — see the note there on why one free provider
 * is not enough.
 */

const TARGET = 'he';

/** Cap the source length: the providers reject very long queries, and lyric
 *  lines are short anyway. */
const MAX_SOURCE_LENGTH = 500;

export { TranslationError };

const providers: TranslationProvider[] = [
  googleMobileProvider,
  googleProvider,
  createMyMemoryProvider(env.MYMEMORY_EMAIL),
];

/** Cache key: case- and whitespace-insensitive, so "Hello  World" and
 *  "hello world" share one row. */
function cacheKey(text: string): string {
  return collapse(text).toLowerCase();
}

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export async function translateToHebrew(rawText: string): Promise<string> {
  const key = cacheKey(rawText).slice(0, MAX_SOURCE_LENGTH);
  if (!key) return '';

  const cached = await prisma.translation.findUnique({
    where: { source_target: { source: key, target: TARGET } },
  });
  // A row written before the provider envelope was validated may hold a quota
  // warning instead of Hebrew. Nothing else ever revisits a cached row, so a
  // poisoned one would be served forever — re-translate over it instead.
  if (cached && !looksLikeProviderWarning(cached.translated)) return cached.translated;

  // Send the original casing (proper nouns translate better), but key the
  // cache on the normalised form.
  const translated = await translateWithFallback(collapse(rawText).slice(0, MAX_SOURCE_LENGTH));

  // Upsert (not create) to tolerate a concurrent write for the same word.
  await prisma.translation.upsert({
    where: { source_target: { source: key, target: TARGET } },
    create: { source: key, target: TARGET, translated },
    update: { translated },
  });

  return translated;
}

/**
 * Tries each provider in turn. Only a `TranslationError` is treated as "this
 * provider is out, try the next" — anything else is a bug in our own code and
 * propagates instead of being silently swallowed by the fallback.
 */
async function translateWithFallback(source: string): Promise<string> {
  const failures: string[] = [];

  for (const provider of providers) {
    try {
      const text = await provider.translate(source, TARGET);
      if (text) return text;
      failures.push(`${provider.name} returned empty`);
    } catch (err) {
      if (!(err instanceof TranslationError)) throw err;
      failures.push(err.message);
    }
  }

  // Surface every reason: with a chain, "translation failed" alone is useless
  // for working out whether it was quota, an outage, or a shape change.
  throw new TranslationError(`All translation providers failed (${failures.join('; ')})`);
}
