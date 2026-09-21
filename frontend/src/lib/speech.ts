/**
 * English pronunciation for saved words, via the browser's built-in
 * SpeechSynthesis. Deliberately not an audio API call: the word bank is
 * offline-friendly, every platform ships English voices, and a network
 * round-trip per tap would repeat the exact fragility the translation chain
 * already has to work around.
 *
 * `pickEnglishVoice` is separated out so the selection rules stay testable
 * without a browser — everything else here is a thin wrapper over the API.
 */

/** Voice shape we depend on, so tests need no DOM lib types. */
export interface VoiceLike {
  lang: string;
  name: string;
  localService?: boolean;
  default?: boolean;
}

/**
 * Picks the voice to read an English word with.
 *
 * Order: en-US first (the accent these lyrics are sung in far more often than
 * not), then any other English locale, and within each a local voice beats a
 * remote one — a remote voice adds latency and fails offline. Returns null when
 * the platform exposes no English voice at all, in which case the caller still
 * speaks and lets the engine fall back on `utterance.lang`.
 */
export function pickEnglishVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  const english = voices.filter((v) => /^en\b|^en[-_]/i.test(v.lang));
  if (english.length === 0) return null;

  const rank = (v: T) =>
    (/^en[-_]us$/i.test(v.lang) ? 0 : 2) + (v.localService === false ? 1 : 0);

  return english.reduce((best, v) => (rank(v) < rank(best) ? v : best));
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Speaks `text` in English. Resolves when the utterance finishes (or fails);
 * callers use that to clear the button's speaking state.
 *
 * Any in-flight utterance is cancelled first — tapping two words in a row
 * should say the second one, not queue behind the first.
 */
export function speakEnglish(text: string): Promise<void> {
  if (!isSpeechSupported() || !text.trim()) return Promise.resolve();

  const synth = window.speechSynthesis;
  synth.cancel();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    // Voices load asynchronously on some platforms; an empty list here just
    // means we fall back to the engine's default for `lang`.
    const voice = pickEnglishVoice(synth.getVoices());
    if (voice) utterance.voice = voice;
    // A shade under natural pace: these are words being learned, not prose.
    utterance.rate = 0.9;

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    synth.speak(utterance);
  });
}
