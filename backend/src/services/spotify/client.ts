const API_BASE = 'https://api.spotify.com/v1';

/** Shapes narrowed to the fields LingoTrack actually consumes. */
export interface SpotifyProfile {
  id: string;
  email: string;
  display_name: string | null;
}

export interface SpotifyTrack {
  id: string | null;
  name: string;
  duration_ms: number;
  // 30-second preview MP3, playable directly in an HTML5 <audio> element. Often
  // null (Spotify omits it for many tracks), so downstream code must tolerate it.
  preview_url: string | null;
  artists: Array<{ name: string }>;
  album: { images: Array<{ url: string; width: number | null; height: number | null }> };
}

export interface SavedTracksPage {
  items: Array<{ added_at: string; track: SpotifyTrack | null }>;
  next: string | null;
  total: number;
}

export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spotify throttles aggressively during a full library sync and answers 429
 * with a Retry-After header (seconds). Honour it rather than hammering.
 */
async function spotifyFetch<T>(url: string, accessToken: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new SpotifyApiError(
        response.status,
        `Spotify API ${response.status} for ${url}: ${await response.text()}`,
      );
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 2 ** attempt * 500;

    await sleep(delayMs);
  }
}

export function getCurrentUserProfile(accessToken: string): Promise<SpotifyProfile> {
  return spotifyFetch<SpotifyProfile>(`${API_BASE}/me`, accessToken);
}

export function getSavedTracksPage(accessToken: string, url?: string): Promise<SavedTracksPage> {
  return spotifyFetch<SavedTracksPage>(url ?? `${API_BASE}/me/tracks?limit=50&offset=0`, accessToken);
}

/**
 * Walks the whole liked-songs library page by page, following Spotify's
 * `next` cursor. Yields pages rather than accumulating so a large library
 * never sits fully in memory.
 */
export async function* iterateSavedTracks(
  accessToken: string,
): AsyncGenerator<SavedTracksPage, void, undefined> {
  let url: string | undefined;

  do {
    const page: SavedTracksPage = await getSavedTracksPage(accessToken, url);
    yield page;
    url = page.next ?? undefined;
  } while (url);
}
