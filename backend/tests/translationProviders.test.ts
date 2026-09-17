import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TranslationError,
  createGoogleDictProvider,
  createMyMemoryProvider,
  decodeHtmlEntities,
  googleMobileProvider,
  googleProvider,
  parseGoogleDictResponse,
  parseGoogleMobileResponse,
  parseGoogleResponse,
  parseMyMemoryResponse,
} from '../src/services/translation/providers.js';

/**
 * Pure parsing tests for both providers. The failure envelopes matter more than
 * the happy paths: MyMemory reports quota exhaustion with HTTP 200 and the
 * complaint inside `translatedText`, which is exactly the shape that used to be
 * cached as if it were a real Hebrew translation.
 */

afterEach(() => vi.unstubAllGlobals());

describe('parseGoogleDictResponse', () => {
  it('reads the bare string array the dict endpoint actually returns', () => {
    expect(parseGoogleDictResponse(['כרכים'])).toBe('כרכים');
  });

  it('joins every sentence, so a long line is not truncated', () => {
    expect(parseGoogleDictResponse(['חלק ראשון ', 'חלק שני'])).toBe('חלק ראשון חלק שני');
  });

  it('also accepts the sentences shape from the same endpoint', () => {
    expect(parseGoogleDictResponse({ sentences: [{ trans: 'שלום' }] })).toBe('שלום');
  });

  it('hands a gtx-shaped body to the gtx parser instead of reading its language tag', () => {
    // The trailing 'en' is the detected language, not a translation — parsing
    // this loosely would cache "en" as though it were Hebrew.
    const gtx = [[['לילה טוב', 'good night', null, null, 3]], null, 'en'];
    expect(parseGoogleDictResponse(gtx)).toBe('לילה טוב');
  });

  it('returns empty for an unexpected shape rather than throwing', () => {
    // A shape change must hand off to the next provider, not crash the request.
    expect(parseGoogleDictResponse(null)).toBe('');
    expect(parseGoogleDictResponse({ error: 'nope' })).toBe('');
    expect(parseGoogleDictResponse([42])).toBe('');
    expect(parseGoogleDictResponse([])).toBe('');
  });
});

describe('parseGoogleResponse', () => {
  it('reads the translation out of the nested array', () => {
    const body = [[['בשעות הלילה', 'nighttime', null, null, 3]], null, 'en'];
    expect(parseGoogleResponse(body)).toBe('בשעות הלילה');
  });

  it('joins every chunk, so a long line is not truncated', () => {
    const body = [
      [
        ['חלק ראשון ', 'first part ', null, null, 3],
        ['חלק שני', 'second part', null, null, 3],
      ],
      null,
      'en',
    ];
    expect(parseGoogleResponse(body)).toBe('חלק ראשון חלק שני');
  });

  it('returns empty for an unexpected shape rather than throwing', () => {
    expect(parseGoogleResponse(null)).toBe('');
    expect(parseGoogleResponse({ responseData: 'x' })).toBe('');
    expect(parseGoogleResponse([null])).toBe('');
  });
});

describe('parseGoogleMobileResponse', () => {
  const page = (inner: string) =>
    `<html><body><div class="result-container">${inner}</div></body></html>`;

  it('pulls the translation out of the result container', () => {
    expect(parseGoogleMobileResponse(page('בשעות הלילה'))).toBe('בשעות הלילה');
  });

  it('decodes HTML entities in the scraped text', () => {
    // The page is HTML, so an apostrophe arrives escaped.
    expect(parseGoogleMobileResponse(page('it&#39;s &amp; more'))).toBe("it's & more");
  });

  it('returns empty when the container is absent, so the chain moves on', () => {
    // A markup change must degrade to the next provider, not throw.
    expect(parseGoogleMobileResponse('<html><body>challenge page</body></html>')).toBe('');
  });
});

describe('decodeHtmlEntities', () => {
  it('handles named, decimal and hex entities', () => {
    expect(decodeHtmlEntities('&amp; &#39; &#x27; &quot;')).toBe(`& ' ' "`);
  });

  it('leaves an unknown entity untouched rather than mangling it', () => {
    expect(decodeHtmlEntities('&bogus; text')).toBe('&bogus; text');
  });
});

describe('parseMyMemoryResponse', () => {
  it('accepts a good response', () => {
    expect(
      parseMyMemoryResponse({ responseStatus: 200, responseData: { translatedText: 'שלום' } }),
    ).toBe('שלום');
  });

  it('tolerates responseStatus arriving as a string', () => {
    expect(
      parseMyMemoryResponse({ responseStatus: '200', responseData: { translatedText: 'שלום' } }),
    ).toBe('שלום');
  });

  it('rejects a quota-exhausted response instead of caching the warning text', () => {
    // The real shape: HTTP 200, quota flag set, warning in the translation slot.
    expect(() =>
      parseMyMemoryResponse({
        responseStatus: 200,
        quotaFinished: true,
        responseData: {
          translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.',
        },
      }),
    ).toThrow(TranslationError);
  });

  it('rejects a warning string even when the envelope looks healthy', () => {
    expect(() =>
      parseMyMemoryResponse({
        responseStatus: 200,
        responseData: {
          translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.',
        },
      }),
    ).toThrow(TranslationError);
  });

  it('rejects a non-200 responseStatus carried over HTTP 200', () => {
    expect(() =>
      parseMyMemoryResponse({ responseStatus: 403, responseData: { translatedText: 'x' } }),
    ).toThrow(/responseStatus 403/);
  });

  it('rejects an empty or non-string translation', () => {
    expect(() => parseMyMemoryResponse({ responseStatus: 200, responseData: {} })).toThrow(
      TranslationError,
    );
    expect(() =>
      parseMyMemoryResponse({ responseStatus: 200, responseData: { translatedText: 42 } }),
    ).toThrow(TranslationError);
  });
});

describe('provider HTTP handling', () => {
  it('calls the dict endpoint with the chrome client and names its host in failures', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(['כרכים']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const provider = createGoogleDictProvider('clients5.google.com');
    expect(await provider.translate('volumes', 'he')).toBe('כרכים');
    expect(urls[0]).toContain('https://clients5.google.com/translate_a/t?');
    expect(urls[0]).toContain('client=dict-chrome-ex');
    expect(urls[0]).toContain('tl=he');
  });

  it('falls through when the dict endpoint is rate-limited', async () => {
    // The 429 that the two older Google paths were returning in production.
    vi.stubGlobal('fetch', async () => new Response('Sorry...', { status: 429 }));
    await expect(createGoogleDictProvider('translate.googleapis.com').translate('hi', 'he'))
      .rejects.toThrow(/google-dict\(translate\) returned 429/);
  });

  it('wraps a network failure as a TranslationError', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(googleProvider.translate('hi', 'he')).rejects.toThrow(/google unreachable/);
  });

  it('wraps a non-2xx response as a TranslationError', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 429 }));
    await expect(createMyMemoryProvider().translate('hi', 'he')).rejects.toThrow(
      /mymemory returned 429/,
    );
  });

  it('sends the `de` contact param only when an email is configured', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'שלום' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    await createMyMemoryProvider('a@b.com').translate('hi', 'he');
    await createMyMemoryProvider().translate('hi', 'he');

    expect(urls[0]).toContain('de=a%40b.com');
    expect(urls[1]).not.toContain('de=');
  });
  it('query-encodes the source for the mobile endpoint', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response('<div class="result-container">אה כן</div>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    });

    const text = await googleMobileProvider.translate("Oh, yeah, I'll tell you", 'he');
    expect(text).toBe('אה כן');
    expect(urls[0]).toContain('q=Oh%2C+yeah%2C+I%27ll+tell+you');
    expect(urls[0]).toContain('tl=he');
  });
});
