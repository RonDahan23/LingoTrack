import { prisma } from '../../lib/prisma.js';
import { parseLrc } from './lyricsParser.js';

/**
 * Persists parsed lyrics for a track. Replaces any existing lines in a single
 * transaction so a re-ingest can't leave a half-old/half-new set, and toggles
 * `Track.lyricsSynced` to reflect whether timed lines are present.
 */
export async function ingestLyricsFromLrc(
  trackId: string,
  rawLrc: string,
): Promise<{ lineCount: number }> {
  const track = await prisma.track.findUniqueOrThrow({
    where: { id: trackId },
    select: { durationMs: true },
  });

  const lines = parseLrc(rawLrc, track.durationMs);

  await prisma.$transaction([
    prisma.lyricLine.deleteMany({ where: { trackId } }),
    ...(lines.length > 0
      ? [
          prisma.lyricLine.createMany({
            data: lines.map((line) => ({
              trackId,
              text: line.text,
              startTime: line.startTime,
              endTime: line.endTime,
              lineNumber: line.lineNumber,
            })),
          }),
        ]
      : []),
    prisma.track.update({
      where: { id: trackId },
      data: { lyricsSynced: lines.length > 0 },
    }),
  ]);

  return { lineCount: lines.length };
}
