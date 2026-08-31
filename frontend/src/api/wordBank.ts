import { apiRequest } from '../lib/apiClient';
import type {
  ReviewHistoryPoint,
  WordBankEntry,
  WordBankStats,
  WordStatus,
} from '../types/word';

export interface WordListResponse {
  words: WordBankEntry[];
  total: number;
  stats: WordBankStats;
}

export interface CaptureWordInput {
  word: string;
  contextLine?: string | null;
  trackId?: string | null;
  /** Translation already shown in the popover — a fallback if the server lookup fails. */
  translation?: string | null;
}

/** Saves a tapped word. Idempotent per word family, so a double-tap is harmless. */
export function captureWord(input: CaptureWordInput): Promise<{ word: WordBankEntry }> {
  return apiRequest<{ word: WordBankEntry }>('/api/words', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** The caller's saved words, optionally filtered by learning status. */
export function fetchWords(status?: WordStatus): Promise<WordListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<WordListResponse>(`/api/words${query}`);
}

export function fetchWordStats(): Promise<{ stats: WordBankStats }> {
  return apiRequest<{ stats: WordBankStats }>('/api/words/stats');
}

export function fetchWord(
  wordId: string,
): Promise<{ word: WordBankEntry; history: ReviewHistoryPoint[] }> {
  return apiRequest<{ word: WordBankEntry; history: ReviewHistoryPoint[] }>(
    `/api/words/${encodeURIComponent(wordId)}`,
  );
}

export function deleteWord(wordId: string): Promise<void> {
  return apiRequest<void>(`/api/words/${encodeURIComponent(wordId)}`, { method: 'DELETE' });
}
