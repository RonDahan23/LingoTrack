import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TranslationError,
  createMyMemoryProvider,
  googleProvider,
  lingvaProvider,
  parseGoogleResponse,
  parseLingvaResponse,
  parseMyMemoryResponse,
} from '../src/services/translation/providers.js';

/**
 * Pure parsing tests for both providers. The failure envelopes matter more than
 * the happy paths: MyMemory reports quota exhaustion with HTTP 200 and the
 * complaint inside `translatedText`, which is exactly the shape that used to be
 * cached as if it were a real Hebrew translation.
 */

afterEach(() => vi.unstubAllGlobals());

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

describe('parseLingvaResponse', () => {
  it('reads the translation field', () => {
    expect(parseLingvaResponse({ translation: 'בשעות הלילה', info: {} })).toBe('בשעות הלילה');
  });

  it('returns empty for an error body or a missing field', () => {
    expect(parseLingvaResponse({ error: 'Invalid target language' })).toBe('');
    expect(parseLingvaResponse(null)).toBe('');
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
  it('url-encodes the source into the path segment', async () => {
    // Lingva takes the text as a path segment, so an unencoded comma or space
    // from a lyric line would corrupt the URL.
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ translation: 'אה כן' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await lingvaProvider.translate("Oh, yeah, I'll tell you", 'he');
    expect(urls[0]).toBe(
      "https://lingva.ml/api/v1/en/he/Oh%2C%20yeah%2C%20I'll%20tell%20you",
    );
  });
});
