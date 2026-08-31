import { apiRequest } from '../lib/apiClient';
import type { Exercise, ExerciseType, WordBankEntry, WordBankStats } from '../types/word';

export interface PracticeSession {
  exercises: Exercise[];
  /** Words due right now — may exceed exercises.length. */
  dueCount: number;
  stats: WordBankStats;
}

/** Fetches a ready-to-render practice session built from due words. */
export function fetchSession(limit?: number): Promise<PracticeSession> {
  const query = limit ? `?limit=${limit}` : '';
  return apiRequest<PracticeSession>(`/api/practice/session${query}`);
}

export interface SubmitAnswerInput {
  wordId: string;
  exerciseType: ExerciseType;
  correct: boolean;
  responseMs?: number | null;
}

export interface SubmitAnswerResult {
  word: WordBankEntry;
  passed: boolean;
  nextIntervalDays: number;
  nextDueAt: string;
  justMastered: boolean;
}

/** Records one graded answer and returns the word's updated schedule. */
export function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  return apiRequest<SubmitAnswerResult>('/api/practice/submit', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
