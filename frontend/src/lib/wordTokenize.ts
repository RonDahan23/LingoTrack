export interface LineToken {
  text: string;
  /** Word tokens are tappable for translation; separators (spaces, punctuation) are not. */
  isWord: boolean;
}

// A "word" run is letters/marks plus internal apostrophes and hyphens
// ("don't", "twenty-one"); everything else (spaces, punctuation) is a separator.
const WORD_RUN = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;

/**
 * Splits a lyric line into ordered word / separator tokens, preserving the
 * original text exactly (join of all token.text === input). Pure and tested so
 * the player's tappable-word rendering has no DOM-parsing surprises.
 */
export function tokenizeLine(line: string): LineToken[] {
  const tokens: LineToken[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(WORD_RUN)) {
    const start = match.index;
    if (start > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, start), isWord: false });
    }
    tokens.push({ text: match[0], isWord: true });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), isWord: false });
  }
  return tokens;
}

/** Strips edge punctuation/quotes from a tapped word before translating it. */
export function cleanWord(word: string): string {
  return word.replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '');
}
