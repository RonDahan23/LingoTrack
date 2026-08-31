import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_WEIGHTS,
  toDifficultyLevel,
  isDifficultyLevel,
} from '../src/config/difficulty.js';

describe('toDifficultyLevel', () => {
  it('maps the ARCHITECTURE.md bucket boundaries', () => {
    expect(toDifficultyLevel(0.0)).toBe('BEGINNER');
    expect(toDifficultyLevel(3.5)).toBe('BEGINNER');
    expect(toDifficultyLevel(3.6)).toBe('INTERMEDIATE');
    expect(toDifficultyLevel(7.0)).toBe('INTERMEDIATE');
    expect(toDifficultyLevel(7.1)).toBe('ADVANCED');
    expect(toDifficultyLevel(10.0)).toBe('ADVANCED');
  });

  it('rejects scores outside 0.0–10.0', () => {
    expect(() => toDifficultyLevel(-0.1)).toThrow(RangeError);
    expect(() => toDifficultyLevel(10.1)).toThrow(RangeError);
    expect(() => toDifficultyLevel(Number.NaN)).toThrow(RangeError);
  });
});

describe('DIFFICULTY_WEIGHTS', () => {
  it('sums to 1', () => {
    const total = Object.values(DIFFICULTY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('isDifficultyLevel', () => {
  it('accepts only the three persisted values', () => {
    expect(isDifficultyLevel('BEGINNER')).toBe(true);
    expect(isDifficultyLevel('beginner')).toBe(false);
    expect(isDifficultyLevel('EXPERT')).toBe(false);
  });
});
