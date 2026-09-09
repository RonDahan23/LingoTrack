/**
 * English → Hebrew translation providers, tried in order by
 * `translationService`. All are free and key-less; none is dependable alone,
 * which is why there is a chain rather than a single call.
 *
 * What each one is, and how it fails:
 *
 *  - **Google mobile** (`translate.google.com/m`) returns an HTML page meant
 *    for feature phones. It is by far the most *available* of the three: it
 *    kept answering from an address where `gtx` was already handing out 429s.
 *    The cost is that it is scraped, so a markup change would break it.
 *  - **Google gtx** returns clean JSON and needs no scraping, but rate-limits
 *    hard per IP — a handful of calls from one address earns 429s for a while.
 *    A datacenter IP shared with other tenants is usually already over.
 *  - **MyMemory** has a per-IP daily character allowance rather than a burst
 *    limit, so it tends to be available exactly when the Google paths are not.
 *
 * Order matters: the most available provider goes first so the common case
 * costs one request, and the two behind it fail for unrelated reasons (markup
 * change vs. burst quota vs. daily quota). A community proxy (Lingva) was
 * tried here and removed — every public instance sat behind a Cloudflare bot
 * challenge, which is precisely how a datacenter IP gets treated.
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

async function get(url: string, provider: string, accept: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: accept },
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'unreachable';
    throw new TranslationError(`${provider} ${reason}`);
  }

  if (!response.ok) throw new TranslationError(`${provider} returned ${response.status}`);
  return response;
}

async function getJson(url: string, provider: string): Promise<unknown> {
  const response = await get(url, provider, 'application/json');
  try {
    return await response.json();
  } catch {
    throw new TranslationError(`${provider} returned a non-JSON body`);
  }
}

/* ----------------------------------------------------------- Google mobile */

const RESULT_CONTAINER = /<div[^>]*class="[^"]*result-container[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** The scraped text is HTML, so entities have to come back out — an
 *  apostrophe arrives as `&#39;` and would otherwise be shown literally. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1]?.toLowerCase() === 'x'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return HTML_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function parseGoogleMobileResponse(html: string): string {
  const inner = RESULT_CONTAINER.exec(html)?.[1];
  if (!inner) return '';
  // The container holds plain text, but strip any stray markup defensively.
  return decodeHtmlEntities(inner.replace(/<[^>]*>/g, '')).trim();
}

export const googleMobileProvider: TranslationProvider = {
  name: 'google-mobile',
  async translate(source, target) {
    const params = new URLSearchParams({ sl: 'en', tl: target, q: source });
    const response = await get(
      `https://translate.google.com/m?${params.toString()}`,
      'google-mobile',
      'text/html',
    );

    const text = parseGoogleMobileResponse(await response.text());
    if (!text) throw new TranslationError('google-mobile returned no translation');
    return text;
  },
};

/* -------------------------------------------------------------- Google gtx */

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
