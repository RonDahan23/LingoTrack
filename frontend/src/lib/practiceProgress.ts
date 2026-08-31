/**
 * Pure helpers for the word bank and practice UI.
 *
 * Kept out of components on purpose: the frontend's Vitest setup is
 * `environment: 'node'` with no jsdom, so anything worth testing has to live in
 * a plain function like these.
 */

import type { Exercise, WordForm } from '../types/word';

const DAY_MS = 24 * 60 * 60 * 1000;

/** "in 3 days" / "tomorrow" / "due now" for a word's next review. */
export function formatDueLabel(dueAtIso: string, now: Date = new Date()): string {
  const due = new Date(dueAtIso).getTime();
  if (!Number.isFinite(due)) return '';
  const diffMs = due - now.getTime();
  if (diffMs <= 0) return 'due now';

  const days = Math.ceil(diffMs / DAY_MS);
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'in 1 week' : `in ${weeks} weeks`;
  }
  const months = Math.round(days / 30);
  return months === 1 ? 'in 1 month' : `in ${months} months`;
}

/** Short interval badge, e.g. "1d", "3d", "2w". */
export function formatInterval(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return 'now';
  if (days < 7) return `${Math.round(days)}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

/** Whole-percent accuracy, or null when there's nothing to divide. */
export function accuracyPercent(correct: number, total: number): number | null {
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((correct / total) * 100);
}

/** Grades an answer. Centralised so every exercise type checks the same way. */
export function isAnswerCorrect(exercise: Exercise, selectedIndex: number): boolean {
  return selectedIndex === exercise.answerIndex;
}

/**
 * Encouragement shown on the session summary.
 *
 * Thresholds rather than a raw score, so the copy never reads as harsh after a
 * genuinely hard set.
 */
export function sessionMessage(correct: number, total: number): string {
  if (total === 0) return 'Nothing to practise yet.';
  const pct = (correct / total) * 100;
  if (pct === 100) return 'Perfect round!';
  if (pct >= 80) return 'Great work!';
  if (pct >= 50) return 'Good progress — keep going.';
  return 'Tricky round. These will come back soon.';
}

/**
 * Orders a word family for display: the base form first, then the rest in a
 * stable grammatical order rather than whatever order the engine emitted.
 */
const FORM_DISPLAY_ORDER: WordForm['label'][] = [
  'base',
  'singular',
  'infinitive',
  'third_person',
  'gerund',
  'past',
  'past_participle',
  'plural',
  'comparative',
  'superlative',
  'adverb',
  'agent_noun',
];

export function sortForms(forms: WordForm[]): WordForm[] {
  const rank = (label: WordForm['label']) => {
    const index = FORM_DISPLAY_ORDER.indexOf(label);
    return index === -1 ? FORM_DISPLAY_ORDER.length : index;
  };
  return [...forms].sort((a, b) => rank(a.label) - rank(b.label));
}

/** Splits a fill-in-the-blank sentence around the blank for styled rendering. */
export function splitOnBlank(sentence: string, blank = '____'): [string, string] {
  const index = sentence.indexOf(blank);
  if (index === -1) return [sentence, ''];
  return [sentence.slice(0, index), sentence.slice(index + blank.length)];
}
