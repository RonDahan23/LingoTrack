import type { LyricLine } from '../types/track';

/**
 * Index of the lyric line active at `positionMs`, or -1 if none (before the
 * first line, or in a gap). Pure and deterministic — the heart of the sync
 * player, unit-tested in isolation. Lines are assumed ordered by startTime with
 * endTime = the next line's start (as the backend parser emits them).
 */
export function findActiveLineIndex(
  lines: Pick<LyricLine, 'startTime' | 'endTime'>[],
  positionMs: number,
): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (positionMs >= line.startTime && positionMs < line.endTime) return i;
  }
  return -1;
}

/** Formats milliseconds as m:ss for the player UI. */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
