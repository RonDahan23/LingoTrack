import type { DifficultyLevel } from '../config/difficulty.js';
import { UNGRADED_LEVEL } from '../config/difficulty.js';
import { prisma } from '../lib/prisma.js';
import { gradeTrack } from './grading/difficultyEngine.js';
import { isEnglishLyrics } from './languageFilter.js';
import { ingestLyricsFromLrc } from './lyrics/lyricsService.js';
import { NullLyricsProvider, type LyricsProvider } from './lyrics/provider.js';

/**
 * Ties the Step 3 pieces to the database: read a track's stored lyrics + total
 * duration, run the pure engine, and persist the resulting score/level onto
 * `Track`. This is the ONLY writer of the difficulty fields (Step 2 ingestion
 * deliberately leaves them alone).
 */

export interface GradeOutcome {
  trackId: string;
  graded: boolean;
  level: DifficultyLevel | typeof UNGRADED_LEVEL;
  score: number;
  reason?: string;
}

/** Grades a track from lyrics already stored in the DB. */
export async function gradeStoredTrack(trackId: string): Promise<GradeOutcome> {
  const track = await prisma.track.findUniqueOrThrow({
    where: { id: trackId },
    select: { durationMs: true },
  });

  const lyricLines = await prisma.lyricLine.findMany({
    where: { trackId },
    orderBy: { lineNumber: 'asc' },
    select: { text: true },
  });

  // Can't grade what we can't read. Leave the track UNGRADED so it stays out of
  // the ranked tabs rather than getting a meaningless score.
  if (lyricLines.length === 0) {
    return {
      trackId,
      graded: false,
      level: UNGRADED_LEVEL,
      score: 0,
      reason: 'no lyrics',
    };
  }

  const result = gradeTrack({
    lines: lyricLines.map((l) => l.text),
    durationMs: track.durationMs,
  });

  await prisma.track.update({
    where: { id: trackId },
    data: { difficultyLevel: result.level, difficultyScore: result.score },
  });

  return { trackId, graded: true, level: result.level, score: result.score };
}

/**
 * Full per-track pipeline: fetch lyrics from the provider, persist them, then
 * grade. A track with no available lyrics is persisted as unsynced/ungraded.
 */
export async function processTrack(
  trackId: string,
  provider: LyricsProvider = new NullLyricsProvider(),
): Promise<GradeOutcome> {
  const track = await prisma.track.findUniqueOrThrow({
    where: { id: trackId },
    select: { id: true, title: true, artist: true, durationMs: true },
  });

  const rawLrc = await provider.fetchSyncedLyrics(track);

  if (!rawLrc) {
    return { trackId, graded: false, level: UNGRADED_LEVEL, score: 0, reason: 'no lyrics available' };
  }

  // English-only: a Latin-script title can hide French/Hebrew/etc. lyrics. Now
  // that we have the actual words, reject non-English ones and clear anything a
  // prior run may have stored, so they never surface in a ranked tab.
  if (!isEnglishLyrics(rawLrc)) {
    await resetTrackGrading(trackId);
    return { trackId, graded: false, level: UNGRADED_LEVEL, score: 0, reason: 'lyrics not in English' };
  }

  await ingestLyricsFromLrc(trackId, rawLrc);
  return gradeStoredTrack(trackId);
}

/** Wipes a track's lyrics and returns it to UNGRADED (used when lyrics are rejected). */
async function resetTrackGrading(trackId: string): Promise<void> {
  await prisma.$transaction([
    prisma.lyricLine.deleteMany({ where: { trackId } }),
    prisma.track.update({
      where: { id: trackId },
      data: { difficultyLevel: UNGRADED_LEVEL, difficultyScore: 0, lyricsSynced: false },
    }),
  ]);
}
