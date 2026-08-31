import { describe, expect, it } from 'vitest';
import { parseLrc } from '../src/services/lyrics/lyricsParser.js';

describe('parseLrc', () => {
  it('parses timestamps into milliseconds and sequential line numbers', () => {
    const lrc = ['[00:12.50]First line', '[00:15.00]Second line'].join('\n');
    const lines = parseLrc(lrc);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ text: 'First line', startTime: 12_500, lineNumber: 1 });
    expect(lines[1]).toMatchObject({ text: 'Second line', startTime: 15_000, lineNumber: 2 });
  });

  it('sets endTime to the next line start', () => {
    const lines = parseLrc(['[00:10.00]A', '[00:13.00]B'].join('\n'));
    expect(lines[0]?.endTime).toBe(13_000);
  });

  it('bounds the last line by track duration when provided', () => {
    const lines = parseLrc('[00:10.00]Only line', 200_000);
    expect(lines[0]?.endTime).toBe(200_000);
  });

  it('falls back to a fixed tail for the last line without a duration', () => {
    const lines = parseLrc('[00:10.00]Only line');
    expect(lines[0]?.endTime).toBe(14_000);
  });

  it('handles centisecond and millisecond fractions', () => {
    const lines = parseLrc(['[00:01.5]half', '[00:02.05]twenty', '[00:03]none'].join('\n'));
    expect(lines[0]?.startTime).toBe(1_500);
    expect(lines[1]?.startTime).toBe(2_050);
    expect(lines[2]?.startTime).toBe(3_000);
  });

  it('expands compressed LRC (multiple timestamps, one text)', () => {
    const lines = parseLrc('[00:20.00][01:00.00]Repeated hook');
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.startTime)).toEqual([20_000, 60_000]);
    expect(lines.every((l) => l.text === 'Repeated hook')).toBe(true);
  });

  it('sorts out-of-order lines by time', () => {
    const lines = parseLrc(['[00:30.00]Later', '[00:05.00]Earlier'].join('\n'));
    expect(lines.map((l) => l.text)).toEqual(['Earlier', 'Later']);
  });

  it('skips metadata tags and blank/instrumental lines', () => {
    const lrc = ['[ar:Some Artist]', '[ti:Some Title]', '[00:08.00]', '[00:10.00]Real line'].join(
      '\n',
    );
    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe('Real line');
  });

  it('collapses internal whitespace', () => {
    const lines = parseLrc('[00:10.00]  too    much   space  ');
    expect(lines[0]?.text).toBe('too much space');
  });

  it('returns an empty array for lyrics with no timestamps', () => {
    expect(parseLrc('just plain text\nno timing here')).toEqual([]);
  });
});
