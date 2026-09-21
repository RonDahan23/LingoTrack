import type { LineToken } from './wordTokenize';

/**
 * Marks the words in a lyric line that the library suggests are unfamiliar.
 *
 * The server sends a plain list of words rather than token positions, so the
 * two tokenisers never have to agree on indices — only on what a word looks
 * like once normalised. That is the one coupling here, and it is why this
 * mirrors the backend's `tokenize` rather than reusing `cleanWord`: the list
 * being matched against was produced by that function.
 */

/** Mirrors backend `services/grading/tokenizer.ts`: lowercase, smart quotes
 *  folded, anything but letters/apostrophe/hyphen dropped, edge marks trimmed. */
export function normaliseForVocabulary(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

/**
 * A line where nearly every word is marked communicates nothing, so past this
 * many the line is left plain. Better to under-mark a dense line than to turn
 * it into a wall of underlines the eye cannot use.
 */
export const MAX_MARKED_PER_LINE = 6;

/**
 * Token indices to mark, or an empty set when the line is too dense to be
 * worth marking. Indices address the token array as rendered, so the caller
 * can apply them directly.
 */
export function rareTokenIndices(
  tokens: readonly LineToken[],
  vocabulary: ReadonlySet<string>,
  maxPerLine: number = MAX_MARKED_PER_LINE,
): Set<number> {
  if (vocabulary.size === 0) return new Set();

  const marked = new Set<number>();
  tokens.forEach((token, i) => {
    if (!token.isWord) return;
    if (vocabulary.has(normaliseForVocabulary(token.text))) marked.add(i);
  });

  return marked.size > maxPerLine ? new Set() : marked;
}
