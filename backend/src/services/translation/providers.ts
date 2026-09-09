/**
 * English → Hebrew translation providers, tried in order by
 * `translationService`. Both are free and key-less; neither is trustworthy on
 * its own, which is why there is a chain rather than a single call:
 *
 *  - MyMemory rate-limits *by IP*, and the deployed backend shares an egress IP
 *    with every other tenant on the host. The anonymous daily quota is
 *    routinely already spent by someone else, so it fails in production while
 *    working perfectly from a laptop.
 *  - Google's `gtx` endpoint gives the best output and needs no key, but it
 *    rate-limits hard per IP — a handful of calls from one address is enough
 *    to get 429s for a while.
 *  - Lingva is a public Google-Translate proxy: same output as `gtx`, but the
 *    call to Google is made from Lingva's address, so our own 429 does not
 *    apply. It is a community instance, so it can simply be down.
 *
 * No single one of these is dependable, and their failure modes are
 * independent — a per-IP quota, a third-party outage, a daily character
 * allowance. Trying all three in order is what makes the feature reliable;
 * `gtx` leads because it is the cheapest and its 429 comes back immediately.
 */

/** A provider failed. Carries the provider name so the 502 body says which. */
export class TranslationError extends Error {}

/** Don't let one hung provider hold the request open — fall through instead.
 *  Kept short because up to three providers are tried in series. */
const REQUEST_TIMEOUT_MS = 6_000;

export interface TranslationProvider {
  readonly name: string;
  translate(source: string, target: string): Promise<string>;
}

async function getJson(url: string, provider: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'unreachable';
    throw new TranslationError(`${provider} ${reason}`);
  }

  if (!response.ok) {
    throw new TranslationError(`${provider} returned ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new TranslationError(`${provider} returned a non-JSON body`);
  }
}

/* ------------------------------------------------------------------ Google */

/**
 * Response shape is a nested array, not an object:
 *   [[["translated","source",…], ["chunk 2","source 2",…]], null, "en", …]
 * Long text is split across several chunks, so every `chunk[0]` is joined —
 * taking only the first would silently truncate a long lyric line.
 */
export function parseGoogleResponse(body: unknown): string {
  if (!Array.isArray(body) || !Array.isArray(body[0])) return '';

  return (body[0] as unknown[])
    .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : ''))
    .join('')
    .trim();
}

export const googleProvider: TranslationProvider = {
  name: 'google',
  async translate(source, target) {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'en',
      tl: target,
      dt: 't',
      q: source,
    });
    const body = await getJson(
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      'google',
    );

    const text = parseGoogleResponse(body);
    if (!text) throw new TranslationError('google returned no translation');
    return text;
  },
};

/* ------------------------------------------------------------------ Lingva */

interface LingvaResponse {
  translation?: unknown;
}

export function parseLingvaResponse(body: unknown): string {
  const translation = (body as LingvaResponse | null)?.translation;
  return typeof translation === 'string' ? translation.trim() : '';
}

export const lingvaProvider: TranslationProvider = {
  name: 'lingva',
  async translate(source, target) {
    // Path-based API: /api/v1/<from>/<to>/<text>, so the text is a path segment.
    const body = await getJson(
      `https://lingva.ml/api/v1/en/${target}/${encodeURIComponent(source)}`,
      'lingva',
    );

    const text = parseLingvaResponse(body);
    if (!text) throw new TranslationError('lingva returned no translation');
    return text;
  },
};

/* ---------------------------------------------------------------- MyMemory */

interface MyMemoryResponse {
  responseStatus?: number | string;
  quotaFinished?: boolean;
  responseData?: { translatedText?: unknown };
}

/**
 * MyMemory reports quota exhaustion and bad input with **HTTP 200** and the
 * complaint in `translatedText` itself. Returning that verbatim would cache an
 * English error string as if it were the Hebrew translation, so the envelope
 * has to be checked before the text is trusted.
 */
const MYMEMORY_WARNING =
  /^(MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID (SOURCE|TARGET) LANGUAGE|'?[A-Z ]*' IS AN INVALID)/i;

/**
 * True for text that is a provider complaint rather than a translation.
 *
 * Also used on the way *out* of the cache: before this check existed, a
 * quota warning could be stored in the `Translation` table as though it were
 * Hebrew, and a cached row is never otherwise revisited. Deployed databases
 * may already hold such rows, so reads are screened too.
 */
export function looksLikeProviderWarning(text: string): boolean {
  return MYMEMORY_WARNING.test(text.trim());
}

export function parseMyMemoryResponse(body: unknown): string {
  const envelope = body as MyMemoryResponse | null;
  if (!envelope || typeof envelope !== 'object') {
    throw new TranslationError('mymemory returned an unexpected body');
  }

  if (envelope.quotaFinished === true) {
    throw new TranslationError('mymemory daily quota exhausted');
  }

  // `responseStatus` is sometimes a string ("200"), so compare numerically.
  const status = Number(envelope.responseStatus);
  if (Number.isFinite(status) && status !== 200) {
    throw new TranslationError(`mymemory responseStatus ${status}`);
  }

  const raw = envelope.responseData?.translatedText;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) throw new TranslationError('mymemory returned no translation');
  if (looksLikeProviderWarning(text)) {
    throw new TranslationError('mymemory rejected the request (quota or bad input)');
  }

  return text;
}

/**
 * `email` is MyMemory's `de` parameter: supplying a contact address raises the
 * anonymous daily allowance roughly tenfold. Optional — omitted when unset.
 */
export function createMyMemoryProvider(email?: string): TranslationProvider {
  return {
    name: 'mymemory',
    async translate(source, target) {
      const params = new URLSearchParams({ q: source, langpair: `en|${target}` });
      if (email) params.set('de', email);

      const body = await getJson(
        `https://api.mymemory.translated.net/get?${params.toString()}`,
        'mymemory',
      );
      return parseMyMemoryResponse(body);
    },
  };
}
