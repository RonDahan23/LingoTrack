import { describe, expect, it } from 'vitest';

import { SRS } from '../src/config/wordBank.js';
import {
  deriveStatus,
  initialSrsState,
  isDue,
  masteryProgress,
  qualityFromCorrect,
  reviewWord,
} from '../src/services/practice/srs.js';
import type { SrsState } from '../src/services/practice/srs.js';
import {
  BLANK,
  blankOutWord,
  generateExercises,
} from '../src/services/practice/quizGenerator.js';
import type { PracticeWord } from '../src/services/practice/quizGenerator.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

describe('initialSrsState', () => {
  it('starts a new word due immediately in LEARNING', () => {
    const state = initialSrsState(NOW);
    expect(state.status).toBe('LEARNING');
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(0);
    expect(state.easeFactor).toBe(SRS.INITIAL_EASE);
    expect(isDue(state.dueAt, NOW)).toBe(true);
  });
});

describe('reviewWord', () => {
  it('schedules the first correct answer one day out', () => {
    const result = reviewWord(initialSrsState(NOW), 4, NOW);
    expect(result.passed).toBe(true);
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(SRS.FIRST_INTERVAL_DAYS);
    expect(daysBetween(result.dueAt, NOW)).toBe(1);
  });

  it('lengthens the interval on consecutive passes', () => {
    let state: SrsState = initialSrsState(NOW);
    state = reviewWord(state, 4, NOW);
    expect(state.intervalDays).toBe(1);
    state = reviewWord(state, 4, NOW);
    expect(state.intervalDays).toBe(SRS.SECOND_INTERVAL_DAYS);
    const third = reviewWord(state, 4, NOW);
    expect(third.intervalDays).toBeGreaterThan(SRS.SECOND_INTERVAL_DAYS);
  });

  it('resets the schedule and counts a lapse on failure', () => {
    let state: SrsState = initialSrsState(NOW);
    state = reviewWord(state, 5, NOW);
    state = reviewWord(state, 5, NOW);
    const failed = reviewWord(state, 1, NOW);

    expect(failed.passed).toBe(false);
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(0);
    expect(failed.lapses).toBe(1);
    expect(failed.status).toBe('LEARNING');
    // Due again straight away, inside the same session.
    expect(isDue(failed.dueAt, NOW)).toBe(true);
  });

  it('lowers ease on a poor answer and raises it on a perfect one', () => {
    const base = initialSrsState(NOW);
    expect(reviewWord(base, 5, NOW).easeFactor).toBeGreaterThan(base.easeFactor);
    expect(reviewWord(base, 3, NOW).easeFactor).toBeLessThan(base.easeFactor);
  });

  it('never drops ease below the floor', () => {
    let state: SrsState = initialSrsState(NOW);
    for (let i = 0; i < 20; i++) state = reviewWord(state, 0, NOW);
    expect(state.easeFactor).toBeGreaterThanOrEqual(SRS.MIN_EASE);
  });

  it('caps the interval', () => {
    let state: SrsState = initialSrsState(NOW);
    for (let i = 0; i < 30; i++) state = reviewWord(state, 5, NOW);
    expect(state.intervalDays).toBeLessThanOrEqual(SRS.MAX_INTERVAL_DAYS);
  });

  it('always grows the interval even at the ease floor', () => {
    // Drive ease to the floor, then confirm repeated passes still advance.
    let state: SrsState = initialSrsState(NOW);
    for (let i = 0; i < 10; i++) state = reviewWord(state, 0, NOW);
    state = reviewWord(state, 3, NOW);
    state = reviewWord(state, 3, NOW);
    const before = state.intervalDays;
    state = reviewWord(state, 3, NOW);
    expect(state.intervalDays).toBeGreaterThan(before);
  });

  it('reaches MASTERED only after a long interval', () => {
    let state: SrsState = initialSrsState(NOW);
    let guard = 0;
    while (state.status !== 'MASTERED' && guard++ < 50) {
      state = reviewWord(state, 5, NOW);
    }
    expect(state.status).toBe('MASTERED');
    expect(state.intervalDays).toBeGreaterThanOrEqual(SRS.MASTERED_INTERVAL_DAYS);
  });

  it('treats out-of-range grades as the nearest valid grade', () => {
    expect(reviewWord(initialSrsState(NOW), 99, NOW).passed).toBe(true);
    expect(reviewWord(initialSrsState(NOW), -5, NOW).passed).toBe(false);
    expect(reviewWord(initialSrsState(NOW), Number.NaN, NOW).passed).toBe(false);
  });
});

describe('deriveStatus', () => {
  it('projects status from the schedule', () => {
    expect(deriveStatus(0, 0)).toBe('LEARNING');
    expect(deriveStatus(SRS.REVIEW_REPETITIONS, 3)).toBe('REVIEW');
    expect(deriveStatus(9, SRS.MASTERED_INTERVAL_DAYS)).toBe('MASTERED');
  });
});

describe('qualityFromCorrect', () => {
  it('maps a boolean onto the SM-2 scale', () => {
    expect(qualityFromCorrect(false)).toBeLessThan(3);
    expect(qualityFromCorrect(true)).toBeGreaterThanOrEqual(3);
  });

  it('rewards a fast correct answer more than a slow one', () => {
    expect(qualityFromCorrect(true, 1000)).toBeGreaterThan(qualityFromCorrect(true, 9000));
  });
});

describe('masteryProgress', () => {
  it('runs from 0 to 1', () => {
    expect(masteryProgress({ intervalDays: 0, status: 'LEARNING' })).toBe(0);
    expect(masteryProgress({ intervalDays: 999, status: 'MASTERED' })).toBe(1);
    const mid = masteryProgress({ intervalDays: 7, status: 'REVIEW' });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------

describe('blankOutWord', () => {
  it('blanks the surface form', () => {
    const result = blankOutWord('I keep climbing higher', 'climbing');
    expect(result?.sentence).toBe(`I keep ${BLANK} higher`);
    expect(result?.matched).toBe('climbing');
  });

  it('is case-insensitive', () => {
    expect(blankOutWord('Climbing higher', 'climbing')?.sentence).toBe(`${BLANK} higher`);
  });

  it('falls back to another family form present in the line', () => {
    const result = blankOutWord('I climbed the wall', 'climbing', [
      { form: 'climbed', label: 'past' },
    ]);
    expect(result?.matched).toBe('climbed');
    expect(result?.sentence).toBe(`I ${BLANK} the wall`);
  });

  it('does not match inside a longer word', () => {
    expect(blankOutWord('the climber fell', 'climb')).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(blankOutWord('a different line', 'climbing')).toBeNull();
  });
});

describe('generateExercises', () => {
  const words: PracticeWord[] = [
    {
      id: 'w1',
      word: 'climbing',
      lemma: 'climb',
      translation: 'מטפס',
      contextLine: 'I keep climbing higher',
      partOfSpeech: 'VERB',
      forms: [
        { form: 'climb', label: 'base' },
        { form: 'to climb', label: 'infinitive' },
        { form: 'climbing', label: 'gerund' },
        { form: 'climbed', label: 'past' },
      ],
    },
    {
      id: 'w2',
      word: 'shadow',
      lemma: 'shadow',
      translation: 'צל',
      contextLine: 'a shadow on the wall',
      partOfSpeech: 'NOUN',
      forms: [
        { form: 'shadow', label: 'singular' },
        { form: 'shadows', label: 'plural' },
      ],
    },
    {
      id: 'w3',
      word: 'bright',
      lemma: 'bright',
      translation: 'בהיר',
      contextLine: 'the bright lights',
      partOfSpeech: 'ADJECTIVE',
      forms: [
        { form: 'bright', label: 'base' },
        { form: 'brighter', label: 'comparative' },
        { form: 'brightly', label: 'adverb' },
      ],
    },
    {
      id: 'w4',
      word: 'silence',
      lemma: 'silence',
      translation: 'שקט',
      contextLine: 'broke the silence',
      partOfSpeech: 'NOUN',
      forms: [
        { form: 'silence', label: 'singular' },
        { form: 'silences', label: 'plural' },
      ],
    },
  ];

  it('builds one exercise per word up to the limit', () => {
    const result = generateExercises(words, { limit: 10, seed: 1 });
    expect(result).toHaveLength(4);
    expect(new Set(result.map((e) => e.wordId)).size).toBe(4);
  });

  it('respects the limit', () => {
    expect(generateExercises(words, { limit: 2, seed: 1 })).toHaveLength(2);
  });

  it('is deterministic for a given seed', () => {
    const a = generateExercises(words, { limit: 10, seed: 42 });
    const b = generateExercises(words, { limit: 10, seed: 42 });
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const a = generateExercises(words, { limit: 10, seed: 1 });
    const b = generateExercises(words, { limit: 10, seed: 999 });
    expect(a).not.toEqual(b);
  });

  it('always points answerIndex at the correct option', () => {
    for (const exercise of generateExercises(words, { limit: 10, seed: 7 })) {
      expect(exercise.options[exercise.answerIndex]).toBeDefined();
      expect(exercise.answerIndex).toBeGreaterThanOrEqual(0);
      expect(exercise.answerIndex).toBeLessThan(exercise.options.length);
    }
  });

  it('never repeats an option within a question', () => {
    for (const exercise of generateExercises(words, { limit: 10, seed: 3 })) {
      const lowered = exercise.options.map((o) => o.toLowerCase());
      expect(new Set(lowered).size).toBe(lowered.length);
    }
  });

  it('mixes exercise types across a session', () => {
    const types = new Set(generateExercises(words, { limit: 10, seed: 5 }).map((e) => e.type));
    expect(types.size).toBeGreaterThan(1);
  });

  it('puts the blank in the sentence for fill-in-the-blank', () => {
    const fill = generateExercises(words, { limit: 10, seed: 5 }).find(
      (e) => e.type === 'FILL_BLANK',
    );
    expect(fill?.sentence).toContain(BLANK);
  });

  it('asks for a named grammatical form in FORM_MATCH', () => {
    const match = generateExercises(words, { limit: 20, seed: 2 }).find(
      (e) => e.type === 'FORM_MATCH',
    );
    if (match) {
      expect(match.prompt).toMatch(/Which is the/);
      expect(match.formLabel).toBeTruthy();
    }
  });

  it('skips a lone word with no distractors rather than emitting a 1-option question', () => {
    const single: PracticeWord[] = [
      {
        id: 'only',
        word: 'lonely',
        lemma: 'lonely',
        translation: 'בודד',
        contextLine: null,
        partOfSpeech: 'ADJECTIVE',
        forms: [{ form: 'lonely', label: 'base' }],
      },
    ];
    expect(generateExercises(single, { limit: 5, seed: 1 })).toEqual([]);
  });

  it('uses the supplied distractor pool when the bank is tiny', () => {
    const single: PracticeWord[] = [
      {
        id: 'only',
        word: 'lonely',
        lemma: 'lonely',
        translation: 'בודד',
        contextLine: null,
        partOfSpeech: 'ADJECTIVE',
        forms: [{ form: 'lonely', label: 'base' }],
      },
    ];
    const result = generateExercises(single, {
      limit: 5,
      seed: 1,
      distractorPool: [
        { word: 'water', translation: 'מים' },
        { word: 'fire', translation: 'אש' },
        { word: 'night', translation: 'לילה' },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.options.length).toBeGreaterThan(1);
  });

  it('handles an empty bank', () => {
    expect(generateExercises([], { limit: 5, seed: 1 })).toEqual([]);
  });
});
