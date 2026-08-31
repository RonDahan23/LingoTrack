import { afterEach, describe, expect, it, vi } from 'vitest';
import { LrcLibProvider } from '../src/services/lyrics/lrclibProvider.js';

const provider = new LrcLibProvider();
const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = realFetch;
});

const track = { id: 't1', title: 'Yellow', artist: 'Coldplay', durationMs: 267_000 };

describe('LrcLibProvider', () => {
  it('returns synced lyrics from the exact-match endpoint', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('/api/get');
      expect(url).toContain('duration=267');
      return jsonResponse({ syncedLyrics: '[00:10.00]Look at the stars', plainLyrics: 'x' });
    });

    expect(await provider.fetchSyncedLyrics(track)).toBe('[00:10.00]Look at the stars');
  });

  it('falls back to search when the exact match 404s, choosing the closest duration', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/get')) return jsonResponse({ error: 'not found' }, 404);
      // search: two synced hits at different durations
      return jsonResponse([
        { syncedLyrics: '[00:00.00]far', duration: 400 },
        { syncedLyrics: '[00:00.00]close', duration: 266 },
      ]);
    });

    expect(await provider.fetchSyncedLyrics(track)).toBe('[00:00.00]close');
  });

  it('returns null when nothing has synced lyrics', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/get')) return jsonResponse({ syncedLyrics: null });
      return jsonResponse([{ syncedLyrics: null, plainLyrics: 'x' }]);
    });

    expect(await provider.fetchSyncedLyrics(track)).toBeNull();
  });

  it('treats a network error as a miss (null), not a throw', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down');
    });
    expect(await provider.fetchSyncedLyrics(track)).toBeNull();
  });
});
