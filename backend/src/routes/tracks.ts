import { Router } from 'express';
import { z } from 'zod';
import { DIFFICULTY_LEVELS, isDifficultyLevel } from '../config/difficulty.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { ingestLyricsFromLrc } from '../services/lyrics/lyricsService.js';
import { LrcLibProvider } from '../services/lyrics/lrclibProvider.js';
import { gradeStoredTrack, processTrack } from '../services/gradingService.js';
import { getGradeState, startGradeLibrary } from '../services/gradeLibraryService.js';

export const tracksRouter: Router = Router();

tracksRouter.use(requireAuth);

interface RankedTrack {
  id: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  difficultyLevel: string;
  difficultyScore: number;
  lyricsSynced: boolean;
  masteredPct: number;
  lastPlayedAt: Date;
}

/**
 * The dashboard's three tabs. Returns the caller's liked tracks that have been
 * graded, grouped by bucket and ordered easiest-first within each. UNGRADED
 * tracks are excluded by the `in DIFFICULTY_LEVELS` filter, so ungraded songs
 * never surface in a tab. Optional ?level= narrows to one bucket.
 */
tracksRouter.get(
  '/tracks/ranked',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;

    const levelFilter = req.query.level;
    if (typeof levelFilter === 'string' && !isDifficultyLevel(levelFilter)) {
      throw new HttpError(400, `Unknown level "${levelFilter}"`);
    }

    const rows = await prisma.userTrackProgress.findMany({
      where: {
        userId,
        track: {
          difficultyLevel: typeof levelFilter === 'string' ? levelFilter : { in: [...DIFFICULTY_LEVELS] },
        },
      },
      select: {
        masteredPct: true,
        lastPlayedAt: true,
        track: {
          select: {
            id: true,
            title: true,
            artist: true,
            albumArtUrl: true,
            difficultyLevel: true,
            difficultyScore: true,
            lyricsSynced: true,
          },
        },
      },
      orderBy: { track: { difficultyScore: 'asc' } },
    });

    const groups: Record<string, RankedTrack[]> = {
      BEGINNER: [],
      INTERMEDIATE: [],
      ADVANCED: [],
    };

    for (const row of rows) {
      const group = groups[row.track.difficultyLevel];
      if (!group) continue; // defensive: a non-bucket level slipped the filter
      group.push({
        ...row.track,
        masteredPct: row.masteredPct,
        lastPlayedAt: row.lastPlayedAt,
      });
    }

    res.json({
      levels: Object.fromEntries(
        DIFFICULTY_LEVELS.map((level) => [
          level,
          { count: groups[level]!.length, tracks: groups[level]! },
        ]),
      ),
    });
  }),
);

/**
 * Kicks off (or reports) the background "analyze my library" job that fetches
 * lyrics + grades all the caller's ungraded tracks. Registered BEFORE the
 * `/tracks/:trackId` route so the literal paths aren't captured as an id.
 */
tracksRouter.post('/tracks/grade-library', (req, res) => {
  const { started, state } = startGradeLibrary(req.userId as string);
  res.status(started ? 202 : 409).json({ started, state });
});

tracksRouter.get('/tracks/grade-status', (req, res) => {
  res.json(getGradeState(req.userId as string));
});

/**
 * A single track from the caller's library plus its ordered, timed lyric lines
 * — the payload the sync player loads. Library-scoped: 404 if the track isn't
 * in the user's library, so track ids can't be enumerated.
 */
tracksRouter.get(
  '/tracks/:trackId',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const trackId = req.params.trackId as string;

    const link = await prisma.userTrackProgress.findUnique({
      where: { userId_trackId: { userId, trackId } },
      select: {
        masteredPct: true,
        track: {
          select: {
            id: true,
            title: true,
            artist: true,
            albumArtUrl: true,
            previewUrl: true,
            durationMs: true,
            difficultyLevel: true,
            difficultyScore: true,
            lyricsSynced: true,
          },
        },
      },
    });

    if (!link) {
      throw new HttpError(404, 'Track is not in your library');
    }

    const lyrics = await prisma.lyricLine.findMany({
      where: { trackId },
      orderBy: { lineNumber: 'asc' },
      select: { text: true, startTime: true, endTime: true, lineNumber: true },
    });

    res.json({ track: { ...link.track, masteredPct: link.masteredPct }, lyrics });
  }),
);

/**
 * "Prepare" a track for the player: fetch real synced lyrics from LRCLIB,
 * ingest them, and grade — in one call. This is the button the player shows
 * before playback. Idempotent-ish: re-running re-fetches and re-grades. If no
 * synced lyrics exist for the track, responds 200 with `prepared: false` rather
 * than erroring, so the UI can say "no lyrics found" cleanly.
 */
const lrcProvider = new LrcLibProvider();

tracksRouter.post(
  '/tracks/:trackId/prepare',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const trackId = req.params.trackId as string;

    const link = await prisma.userTrackProgress.findUnique({
      where: { userId_trackId: { userId, trackId } },
    });
    if (!link) throw new HttpError(404, 'Track is not in your library');

    const outcome = await processTrack(trackId, lrcProvider);
    res.json({
      prepared: outcome.graded,
      level: outcome.level,
      score: outcome.score,
      reason: outcome.reason,
    });
  }),
);

const lyricsBody = z.object({
  lrc: z.string().min(1, 'lrc is required'),
});

/**
 * Ingests LRC lyrics for a track and grades it in one call. Until a real
 * LyricsProvider is wired in, this is how lyrics enter the system (Step 5's
 * player reads what it stores). Ownership-scoped: a user can only touch tracks
 * in their own library.
 */
tracksRouter.post(
  '/tracks/:trackId/lyrics',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const trackId = req.params.trackId as string;

    const link = await prisma.userTrackProgress.findUnique({
      where: { userId_trackId: { userId, trackId } },
    });
    if (!link) {
      throw new HttpError(404, 'Track is not in your library');
    }

    const parsed = lyricsBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    const { lineCount } = await ingestLyricsFromLrc(trackId, parsed.data.lrc);
    const grade = await gradeStoredTrack(trackId);

    res.status(201).json({ lineCount, grade });
  }),
);
