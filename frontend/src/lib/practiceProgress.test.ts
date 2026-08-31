import { describe, expect, it } from 'vitest';

import {
  accuracyPercent,
  formatDueLabel,
  formatInterval,
  isAnswerCorrect,
  sessionMessage,
  sortForms,
  splitOnBlank,
} from './practiceProgress';
import type { Exercise } from '../types/word';

const NOW = new Date('2026-01-01T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function isoIn(days: number): string {
  return new Date(NOW.getTime() + days * DAY_MS).toISOString();
}

describe('formatDueLabel', () => {
  it('reports a past or present due date as due now', () => {
    expect(formatDueLabel(isoIn(-1), NOW)).toBe('due now');
    expect(formatDueLabel(NOW.toISOString(), NOW)).toBe('due now');
  });

  it('names tomorrow', () => {
    expect(formatDueLabel(isoIn(1), NOW)).toBe('tomorrow');
  });

  it('counts days inside a week', () => {
    expect(formatDueLabel(isoIn(3), NOW)).toBe('in 3 days');
  });

  it('switches to weeks and months', () => {
    expect(formatDueLabel(isoIn(14), NOW)).toBe('in 2 weeks');
    expect(formatDueLabel(isoIn(60), NOW)).toBe('in 2 months');
  });

  it('returns empty for an unparseable date', () => {
    expect(formatDueLabel('not-a-date', NOW)).toBe('');
  });
});

describe('formatInterval', () => {
  it('formats days, weeks and months', () => {
    expect(formatInterval(0)).toBe('now');
    expect(formatInterval(3)).toBe('3d');
    expect(formatInterval(14)).toBe('2w');
    expect(formatInterval(60)).toBe('2mo');
  });

  it('handles nonsense input', () => {
    expect(formatInterval(Number.NaN)).toBe('now');
    expect(formatInterval(-5)).toBe('now');
  });
});

describe('accuracyPercent', () => {
  it('rounds to whole percent', () => {
    expect(accuracyPercent(1, 3)).toBe(33);
    expect(accuracyPercent(5, 5)).toBe(100);
  });

  it('returns null with no attempts', () => {
    expect(accuracyPercent(0, 0)).toBeNull();
  });
});

describe('isAnswerCorrect', () => {
  const exercise: Exercise = {
    id: 'e1',
    wordId: 'w1',
    type: 'MCQ_EN_TO_HE',
    prompt: 'climb',
    options: ['א', 'ב', 'ג'],
    answerIndex: 1,
    word: 'climb',
    translation: 'ב',
  };

  it('accepts only the answer index', () => {
    expect(isAnswerCorrect(exercise, 1)).toBe(true);
    expect(isAnswerCorrect(exercise, 0)).toBe(false);
    expect(isAnswerCorrect(exercise, -1)).toBe(false);
  });
});

describe('sessionMessage', () => {
  it('scales with the score', () => {
    expect(sessionMessage(0, 0)).toMatch(/Nothing/);
    expect(sessionMessage(5, 5)).toMatch(/Perfect/);
    expect(sessionMessage(4, 5)).toMatch(/Great/);
    expect(sessionMessage(3, 5)).toMatch(/Good/);
    expect(sessionMessage(1, 5)).toMatch(/Tricky/);
  });
});

describe('sortForms', () => {
  it('puts the base form first and keeps a stable grammatical order', () => {
    const sorted = sortForms([
      { form: 'climbed', label: 'past' },
      { form: 'climber', label: 'agent_noun' },
      { form: 'climb', label: 'base' },
      { form: 'climbing', label: 'gerund' },
    ]);
    expect(sorted.map((f) => f.label)).toEqual(['base', 'gerund', 'past', 'agent_noun']);
  });

  it('does not mutate its input', () => {
    const input = [
      { form: 'climbed', label: 'past' as const },
      { form: 'climb', label: 'base' as const },
    ];
    sortForms(input);
    expect(input[0]!.label).toBe('past');
  });
});

describe('splitOnBlank', () => {
  it('splits around the blank', () => {
    expect(splitOnBlank('I keep ____ higher')).toEqual(['I keep ', ' higher']);
  });

  it('returns the whole string when there is no blank', () => {
    expect(splitOnBlank('no blank here')).toEqual(['no blank here', '']);
  });
});
