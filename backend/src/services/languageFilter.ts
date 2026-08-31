/**
 * Heuristic English/Latin-script filter for track ingestion.
 *
 * Spotify exposes no language field on tracks, and reliable language detection
 * needs the lyrics (which aren't available at ingest time). The signal we DO
 * have is the writing system: English is Latin script, so a title or artist
 * containing Hebrew, Arabic, Cyrillic, Greek, Armenian, Devanagari, or CJK
 * characters is not an English track. This definitively removes Hebrew songs.
 *
 * Limitation: it does NOT separate Latin-script languages (Spanish, French,
 * German). Distinguishing those needs lyrics-level detection — a follow-up for
 * when a real lyrics provider is wired in (detect on the fetched LRC, reject
 * non-English before grading).
 */

// Inclusive Unicode-block ranges for the non-Latin scripts we reject. Checked
// numerically (rather than via a regex character class) to keep the source pure
// ASCII and side-step the misleading-character-class pitfall. Accented Latin
// (Latin-1 Supplement / Extended) is not listed, so it passes as English.
const NON_LATIN_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0370, 0x03ff], // Greek
  [0x0400, 0x04ff], // Cyrillic
  [0x0530, 0x058f], // Armenian
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0900, 0x097f], // Devanagari
  [0x3040, 0x30ff], // Japanese kana (Hiragana + Katakana)
  [0x3400, 0x9fff], // CJK Unified Ideographs (+ Ext A)
  [0xac00, 0xd7af], // Hangul syllables
];

/** True if the text contains any character in a non-Latin script we filter. */
export function hasNonLatinScript(text: string): boolean {
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;
    for (const [lo, hi] of NON_LATIN_RANGES) {
      if (cp >= lo && cp <= hi) return true;
    }
  }
  return false;
}

/**
 * Whether a track should be treated as English (kept), by SCRIPT only — a cheap
 * ingest-time gate that removes Hebrew/Arabic/etc. by title/artist. It cannot
 * tell Latin-script languages apart (French, Spanish…); use `isEnglishLyrics`
 * once the actual lyrics are available for that.
 */
export function isEnglishTrack(title: string, artist: string): boolean {
  return !hasNonLatinScript(title) && !hasNonLatinScript(artist);
}

// The most frequent English words. English lyrics are dense with these (~30%+
// of tokens); French/Spanish/other Latin-script lyrics score near zero, which
// is what separates them from English without a heavyweight NLP dependency.
const COMMON_ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'so', 'to', 'of', 'in', 'on', 'at', 'for',
  'with', 'from', 'by', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'our', 'is', 'am', 'are', 'was', 'were', 'be', 'been',
  'do', 'does', 'did', 'have', 'has', 'had', 'this', 'that', 'these', 'those', 'not', 'no',
  'yes', 'can', 'will', 'would', 'just', 'now', 'know', 'like', 'love', 'get', 'got', 'up',
  'down', 'out', 'all', 'what', 'when', 'why', 'how', 'who', 'go', 'come', 'want', 'need',
  'feel', 'see', 'say', 'said', 'make', 'let', 'never', 'always', 'one', 'oh', 'baby',
]);

/**
 * Whether a block of text reads as English. Two gates: (1) reject when >15% of
 * letters are non-Latin (Hebrew, Arabic, CJK…); (2) require ≥12% of words to be
 * common English words — high for English lyrics, ~0 for French/Spanish. Used on
 * fetched lyrics so non-English songs that slipped the title filter don't grade.
 */
export function isEnglishText(text: string): boolean {
  let latinLetters = 0;
  let nonLatinLetters = 0;
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    if (hasNonLatinScript(ch)) nonLatinLetters++;
    else latinLetters++;
  }
  const totalLetters = latinLetters + nonLatinLetters;
  if (totalLetters === 0) return false;
  if (nonLatinLetters / totalLetters > 0.15) return false;

  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 5) return false;
  const hits = words.filter((w) => COMMON_ENGLISH_WORDS.has(w)).length;
  return hits / words.length >= 0.12;
}

/** Applies `isEnglishText` to LRC after stripping its `[..]` tags/timestamps. */
export function isEnglishLyrics(lrc: string): boolean {
  return isEnglishText(lrc.replace(/\[[^\]]*\]/g, ' '));
}
