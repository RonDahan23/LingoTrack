/**
 * Parses LRC-format synced lyrics into ordered, timed lines.
 *
 * LRC is the de-facto standard delivered by lyrics providers: each line is
 * prefixed with one or more `[mm:ss.xx]` timestamps, plus optional `[tag:value]`
 * metadata (`[ar:...]`, `[ti:...]`, `[length:...]`). This is a pure function —
 * persistence lives in lyricsService.ts.
 */

export interface ParsedLyricLine {
  text: string;
  startTime: number; // ms from song start
  endTime: number; // ms; = next line's start, or startTime + tail for the last
  lineNumber: number; // 1-based, in play order
}

/** Matches a single [mm:ss], [mm:ss.xx] or [mm:ss.xxx] timestamp. */
const TIMESTAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** Tail added to the final line when no track duration is supplied. */
const DEFAULT_TAIL_MS = 4000;

function fractionToMs(fraction: string | undefined): number {
  if (!fraction) return 0;
  // "5" → 500ms, "05" → 50ms, "050" → 50ms. Pad/truncate to 3 digits.
  return Number(fraction.padEnd(3, '0').slice(0, 3));
}

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * @param raw        LRC document.
 * @param durationMs Optional track length; bounds the final line's endTime.
 */
export function parseLrc(raw: string, durationMs?: number | null): ParsedLyricLine[] {
  const collected: Array<{ startTime: number; text: string }> = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    TIMESTAMP.lastIndex = 0;

    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = TIMESTAMP.exec(rawLine)) !== null) {
      const [, mm, ss, frac] = match;
      stamps.push(Number(mm) * 60_000 + Number(ss) * 1000 + fractionToMs(frac));
    }

    // No timestamp → metadata tag or a plain line we can't place; skip it.
    if (stamps.length === 0) continue;

    const text = cleanText(rawLine.replace(TIMESTAMP, ''));
    if (text.length === 0) continue; // instrumental / spacer marker

    // Compressed LRC repeats one text at several timestamps — emit each.
    for (const startTime of stamps) {
      collected.push({ startTime, text });
    }
  }

  collected.sort((a, b) => a.startTime - b.startTime);

  return collected.map((line, index) => {
    const next = collected[index + 1];
    const fallbackEnd = line.startTime + DEFAULT_TAIL_MS;
    const endTime = next
      ? next.startTime
      : durationMs && durationMs > line.startTime
        ? durationMs
        : fallbackEnd;

    return {
      text: line.text,
      startTime: line.startTime,
      endTime,
      lineNumber: index + 1,
    };
  });
}
