import { PENDING_DIFFICULTY_SCORE, UNGRADED_LEVEL } from '../config/difficulty.js';
import { prisma } from '../lib/prisma.js';
import { startGradeLibrary } from './gradeLibraryService.js';
import { isEnglishTrack } from './languageFilter.js';
import { iterateSavedTracks, type SpotifyTrack } from './spotify/client.js';
import { getValidAccessToken } from './tokenService.js';

/**
 * Background ingestion of a user's Spotify liked songs.
 *
 * `Track` rows are global (keyed by Spotify track ID) and shared across users;
 * the per-user link is `UserTrackProgress`.
 */

export interface SyncResult {
  pagesFetched: number;
  tracksSeen: number;
  tracksSkipped: number;
  /** Non-English tracks skipped at ingest (never written). */
  nonEnglishSkipped: number;
  /** Previously-ingested non-English tracks removed from the DB this run. */
  nonEnglishPruned: number;
  linksCreated: number;
  finishedAt: Date;
}

export type SyncState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: Date }
  | { status: 'succeeded'; startedAt: Date; result: SyncResult }
  | { status: 'failed'; startedAt: Date; error: string };

/**
 * In-process job registry. Adequate for a single API instance; if the backend
 * is ever scaled horizontally this needs to move to a shared queue, since two
 * instances would otherwise sync the same user concurrently.
 */
const syncStates = new Map<string, SyncState>();

export function getSyncState(userId: string): SyncState {
  return syncStates.get(userId) ?? { status: 'idle' };
}

export function isSyncRunning(userId: string): boolean {
  return getSyncState(userId).status === 'running';
}

/**
 * Starts a sync in the background and returns immediately. Re-entrant calls
 * for a user already syncing are ignored, so a client that taps refresh twice
 * doesn't double-write.
 */
export function startLikedTracksSync(userId: string): { started: boolean; state: SyncState } {
  if (isSyncRunning(userId)) {
    return { started: false, state: getSyncState(userId) };
  }

  const startedAt = new Date();
  syncStates.set(userId, { status: 'running', startedAt });

  void syncLikedTracks(userId)
    .then((result) => {
      syncStates.set(userId, { status: 'succeeded', startedAt, result });
      console.log(
        `[sync] user=${userId} ok pages=${result.pagesFetched} tracks=${result.tracksSeen} new-links=${result.linksCreated}`,
      );
      // Automatically grade the freshly-synced library so tracks appear in the
      // ranked tabs without the user preparing each one by hand.
      startGradeLibrary(userId);
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      syncStates.set(userId, { status: 'failed', startedAt, error });
      console.error(`[sync] user=${userId} failed:`, err);
    });

  return { started: true, state: getSyncState(userId) };
}

/** Picks the largest available album image; Spotify returns them widest-first. */
function pickAlbumArt(track: SpotifyTrack): string | null {
  return track.album?.images?.[0]?.url ?? null;
}

function primaryArtist(track: SpotifyTrack): string {
  const names = track.artists?.map((a) => a.name).filter(Boolean) ?? [];
  return names.length > 0 ? names.join(', ') : 'Unknown Artist';
}

/** Runs the full ingestion synchronously. Exported for tests and CLI use. */
export async function syncLikedTracks(userId: string): Promise<SyncResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const accessToken = await getValidAccessToken(user);

  let pagesFetched = 0;
  let tracksSeen = 0;
  let tracksSkipped = 0;
  let nonEnglishSkipped = 0;
  let linksCreated = 0;

  for await (const page of iterateSavedTracks(accessToken)) {
    pagesFetched++;

    for (const item of page.items) {
      const track = item.track;

      // Local-only files and unavailable tracks come back with a null id and
      // cannot be keyed or played.
      if (!track?.id) {
        tracksSkipped++;
        continue;
      }

      // English-only library: skip non-Latin-script (Hebrew, etc.) tracks so
      // they never enter the DB. See languageFilter.ts for the heuristic.
      if (!isEnglishTrack(track.name, primaryArtist(track))) {
        nonEnglishSkipped++;
        continue;
      }

      tracksSeen++;

      await prisma.track.upsert({
        where: { id: track.id },
        create: {
          id: track.id,
          title: track.name,
          artist: primaryArtist(track),
          albumArtUrl: pickAlbumArt(track),
          durationMs: track.duration_ms,
          previewUrl: track.preview_url,
          difficultyLevel: UNGRADED_LEVEL,
          difficultyScore: PENDING_DIFFICULTY_SCORE,
          lyricsSynced: false,
        },
        // Refresh mutable metadata only. Difficulty fields and lyricsSynced are
        // owned by the Step 3 grading pipeline; overwriting them here would
        // silently re-queue every track on each sync.
        update: {
          title: track.name,
          artist: primaryArtist(track),
          albumArtUrl: pickAlbumArt(track),
          durationMs: track.duration_ms,
          previewUrl: track.preview_url,
        },
      });

      const link = await prisma.userTrackProgress.findUnique({
        where: { userId_trackId: { userId, trackId: track.id } },
      });

      if (!link) {
        await prisma.userTrackProgress.create({
          data: { userId, trackId: track.id },
        });
        linksCreated++;
      }
      // An existing link is left alone: masteredPct and lastPlayedAt are user
      // progress, not Spotify state.
    }
  }

  // Clean up any non-English tracks ingested before this filter existed.
  const nonEnglishPruned = await pruneNonEnglishTracks(userId);

  return {
    pagesFetched,
    tracksSeen,
    tracksSkipped,
    nonEnglishSkipped,
    nonEnglishPruned,
    linksCreated,
    finishedAt: new Date(),
  };
}

/**
 * Removes the user's already-ingested non-English tracks. `Track` rows are
 * global, so deleting one cascades to its lyrics and every user's progress —
 * acceptable for this single-user app, but revisit for multi-user (delete only
 * the caller's link and reap orphans instead). Returns the count removed.
 */
export async function pruneNonEnglishTracks(userId: string): Promise<number> {
  const tracks = await prisma.track.findMany({
    where: { userProgress: { some: { userId } } },
    select: { id: true, title: true, artist: true },
  });

  const nonEnglishIds = tracks
    .filter((t) => !isEnglishTrack(t.title, t.artist))
    .map((t) => t.id);

  if (nonEnglishIds.length === 0) return 0;

  const { count } = await prisma.track.deleteMany({
    where: { id: { in: nonEnglishIds } },
  });
  return count;
}
