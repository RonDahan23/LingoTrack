import type { LyricsProvider, LyricsQuery } from './provider.js';

/**
 * Real synced-lyrics provider backed by LRCLIB (https://lrclib.net) — a free,
 * open, key-less lyrics database that returns LRC. Tries the exact-match
 * endpoint first (artist + title + duration), then falls back to search.
 *
 * Network failures and misses both resolve to null: a track simply stays
 * unsynced/ungraded rather than erroring the prepare flow.
 */
const BASE = 'https://lrclib.net/api';

interface LrcLibRecord {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental?: boolean;
  duration?: number;
}

export class LrcLibProvider implements LyricsProvider {
  async fetchSyncedLyrics(track: LyricsQuery): Promise<string | null> {
    const durationSec = track.durationMs ? Math.round(track.durationMs / 1000) : undefined;

    const exact = await this.getExact(track.title, track.artist, durationSec);
    if (exact) return exact;

    return this.search(track.title, track.artist, durationSec);
  }

  /** GET /api/get — exact metadata match. 404 when not found. */
  private async getExact(
    title: string,
    artist: string,
    durationSec: number | undefined,
  ): Promise<string | null> {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (durationSec) params.set('duration', String(durationSec));

    const record = await this.fetchJson<LrcLibRecord>(`${BASE}/get?${params.toString()}`);
    return record?.syncedLyrics ?? null;
  }

  /** GET /api/search — fuzzy fallback; pick the best synced, duration-close hit. */
  private async search(
    title: string,
    artist: string,
    durationSec: number | undefined,
  ): Promise<string | null> {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const results = await this.fetchJson<LrcLibRecord[]>(`${BASE}/search?${params.toString()}`);
    if (!Array.isArray(results)) return null;

    const synced = results.filter((r) => r.syncedLyrics && !r.instrumental);
    if (synced.length === 0) return null;

    // Prefer the closest duration when we know it, else the first synced hit.
    if (durationSec) {
      synced.sort(
        (a, b) =>
          Math.abs((a.duration ?? 0) - durationSec) - Math.abs((b.duration ?? 0) - durationSec),
      );
    }
    return synced[0]?.syncedLyrics ?? null;
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'LingoTrack (language-learning app)' },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null; // network error → treat as a miss
    }
  }
}
