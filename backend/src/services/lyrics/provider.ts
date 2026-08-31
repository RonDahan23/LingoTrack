import type { Track } from '@prisma/client';

/**
 * Abstraction over the external "Lyrics Provider API" named in ARCHITECTURE.md
 * §1. LingoTrack consumes LRC-format synced lyrics; the concrete provider (e.g.
 * a Musixmatch/LRCLIB-style service) is wired in behind this interface so the
 * ingestion and grading pipeline stays independent of any one vendor.
 */
/** Track fields a provider may use to look up lyrics. */
export type LyricsQuery = Pick<Track, 'id' | 'title' | 'artist' | 'durationMs'>;

export interface LyricsProvider {
  /** Returns raw LRC for the track, or null when no synced lyrics exist. */
  fetchSyncedLyrics(track: LyricsQuery): Promise<string | null>;
}

/**
 * Default provider until a real one is configured. Returns null (no lyrics
 * available), so the pipeline runs end to end but marks tracks unsynced rather
 * than fabricating lyrics. Replace by implementing LyricsProvider against the
 * chosen vendor and injecting it into processTrack().
 */
export class NullLyricsProvider implements LyricsProvider {
  fetchSyncedLyrics(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
