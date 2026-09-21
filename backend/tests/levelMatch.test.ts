import { describe, expect, it } from 'vitest';

import {
  estimateTargetScore,
  pickTrack,
  type PickCandidate,
} from '../src/services/picker/levelMatch.js';

const track = (id: string, difficultyScore: number, masteredPct = 0): PickCandidate => ({
  id,
  difficultyScore,
  masteredPct,
});

/** A spread library: 1.0 … 9.0. */
const LIBRARY: PickCandidate[] = [
  track('a', 1.0),
  track('b', 2.0),
  track('c', 3.0),
  track('d', 4.0),
  track('e', 5.0),
  track('f', 7.0),
  track('g', 9.0),
];

describe('estimateTargetScore', () => {
  it('starts a learner with no history near the easy end of their own library', () => {
    // Relative, not an absolute constant: "easy" differs library to library.
    const target = estimateTargetScore(LIBRARY);
    expect(target).toBeGreaterThan(2.0);
    expect(target).toBeLessThan(3.0);
  });

  it('aims slightly above what the learner already handles', () => {
    // Comprehensible input — matching exactly would only reinforce.
    const target = estimateTargetScore([track('a', 1, 0), track('e', 5.0, 0.8)]);
    expect(target).toBeGreaterThan(5.0);
    expect(target).toBeLessThan(5.5);
  });

  it('weights a half-mastered track above one merely opened', () => {
    const target = estimateTargetScore([track('easy', 2.0, 0.9), track('hard', 8.0, 0.1)]);
    // Pulled toward the well-practised easy track, not the midpoint of 5.0.
    expect(target).toBeLessThan(4.0);
  });

  it('returns 0 for an empty library rather than NaN', () => {
    expect(estimateTargetScore([])).toBe(0);
  });

  it('never divides by zero when every touched track is at 0%', () => {
    expect(Number.isFinite(estimateTargetScore([track('a', 3.0, 0), track('b', 4.0, 0)]))).toBe(true);
  });
});

describe('pickTrack', () => {
  it('picks the track closest to the target level', () => {
    expect(pickTrack(LIBRARY, 5.0, { seed: 0 })?.id).toBe('e');
    expect(pickTrack(LIBRARY, 8.9, { seed: 0 })?.id).toBe('g');
  });

  it('is deterministic for the same seed', () => {
    const first = pickTrack(LIBRARY, 4.0, { seed: 7 });
    const second = pickTrack(LIBRARY, 4.0, { seed: 7 });
    expect(first?.id).toBe(second?.id);
  });

  it('varies with the seed, so pressing the button again gives something else', () => {
    const picks = new Set([0, 1, 2, 3, 4].map((seed) => pickTrack(LIBRARY, 4.0, { seed })?.id));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('never returns the excluded track while others exist', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      expect(pickTrack(LIBRARY, 5.0, { seed, excludeId: 'e' })?.id).not.toBe('e');
    }
  });

  it('repeats the only track rather than returning nothing', () => {
    const only = [track('solo', 3.0)];
    expect(pickTrack(only, 3.0, { seed: 1, excludeId: 'solo' })?.id).toBe('solo');
  });

  it('stays inside the level-appropriate band', () => {
    // Varying the seed must not reach the 9.0 track when aiming at 2.0.
    const ids = [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => pickTrack(LIBRARY, 2.0, { seed })?.id);
    expect(ids).not.toContain('g');
  });

  it('tolerates a negative seed', () => {
    expect(pickTrack(LIBRARY, 4.0, { seed: -3 })).not.toBeNull();
  });

  it('returns null for an empty library', () => {
    expect(pickTrack([], 5.0, { seed: 0 })).toBeNull();
  });
});
