import { apiRequest } from '../lib/apiClient';

/** One dictionary sense group, as returned by /api/lookup. */
export interface WordSense {
  pos: string;
  /** Google's own label: "noun", "verb", … */
  label: string;
  translations: string[];
}

export interface WordLookup {
  word: string;
  lemma: string;
  partOfSpeech: string;
  translation: string;
  senses: WordSense[];
}

/**
 * Session cache keyed on word AND line: the same word in two different lines
 * can legitimately resolve to two different senses, which is the entire point
 * of sending the line.
 */
const cache = new Map<string, WordLookup>();

/** A tapped word, resolved against the lyric line it appeared in. */
export async function lookupWord(word: string, line: string): Promise<WordLookup> {
  const key = `${word.toLowerCase()}|${line}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const result = await apiRequest<WordLookup>(
    `/api/lookup?word=${encodeURIComponent(word)}&line=${encodeURIComponent(line)}`,
  );
  cache.set(key, result);
  return result;
}
