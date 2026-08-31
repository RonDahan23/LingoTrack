import { apiRequest } from '../lib/apiClient';

interface TranslateResponse {
  source: string;
  target: string;
  translation: string;
}

// Session-level cache so repeated taps of the same word don't re-request
// (the backend caches too, but this saves the round-trip entirely).
const cache = new Map<string, string>();

/** English → Hebrew for a word or a full lyric line. */
export async function translateToHebrew(text: string): Promise<string> {
  const key = text.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const { translation } = await apiRequest<TranslateResponse>(
    `/api/translate?text=${encodeURIComponent(text)}`,
  );
  cache.set(key, translation);
  return translation;
}
