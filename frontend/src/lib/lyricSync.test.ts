import { describe, it, expect } from 'vitest';
import { findActiveLineIndex, formatTimestamp } from './lyricSync';

const lines = [
  { startTime: 10_000, endTime: 14_000 },
  { startTime: 14_000, endTime: 18_000 },
  { startTime: 18_000, endTime: 240_000 },
];

describe('findActiveLineIndex', () => {
  it('returns -1 before the first line', () => {
    expect(findActiveLineIndex(lines, 0)).toBe(-1);
    expect(findActiveLineIndex(lines, 9_999)).toBe(-1);
  });

  it('matches the active line by half-open interval [start, end)', () => {
    expect(findActiveLineIndex(lines, 10_000)).toBe(0);
    expect(findActiveLineIndex(lines, 13_999)).toBe(0);
    expect(findActiveLineIndex(lines, 14_000)).toBe(1); // boundary belongs to next
    expect(findActiveLineIndex(lines, 18_500)).toBe(2);
  });

  it('returns -1 past the last line', () => {
    expect(findActiveLineIndex(lines, 240_000)).toBe(-1);
  });

  it('handles empty lyrics', () => {
    expect(findActiveLineIndex([], 5_000)).toBe(-1);
  });
});

describe('formatTimestamp', () => {
  it('formats ms as m:ss', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(5_000)).toBe('0:05');
    expect(formatTimestamp(65_000)).toBe('1:05');
    expect(formatTimestamp(-500)).toBe('0:00');
  });
});
