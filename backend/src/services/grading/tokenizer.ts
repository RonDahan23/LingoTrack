import { lookupCefrLevel, type CefrLevel } from '../../config/cefr.js';

/**
 * Text normalisation shared by the difficulty engine and (later) the player's
 * word-chip builder. Kept in one place so a word graded as "known" is the same
 * word the UI makes tappable.
 */

/**
 * Splits a lyric line into lowercase word tokens, stripping punctuation.
 * Keeps intra-word apostrophes and hyphens ("don't", "twenty-one") since those
 * are single lexical units. Everything else is a separator.
 */
export function tokenize(line: string): string[] {
  return line
    .toLowerCase()
    .replace(/[’‘]/g, "'") // normalise smart quotes before matching
    .split(/[^a-z'-]+/)
    .map((token) => token.replace(/^['-]+|['-]+$/g, '')) // trim leading/trailing marks
    .filter((token) => token.length > 0);
}

/**
 * Suffix rules for reducing an inflected form to candidate lemmas. Deliberately
 * simple — this is frequency profiling, not a full stemmer; over-stemming a
 * rare word just leaves it "unknown", which is already the high-difficulty
 * default. Each rule may yield several candidates (e.g. -ing → both the bare
 * stem and a restored silent "e") tried against the lexicon in turn.
 */
const LEMMA_RULES: ReadonlyArray<{
  suffix: string;
  replacements: readonly string[];
  minStem: number;
  /** Whether to also try collapsing a doubled final consonant (running→run). */
  undouble: boolean;
}> = [
  { suffix: 'ies', replacements: ['y'], minStem: 2, undouble: false },
  { suffix: 'ied', replacements: ['y'], minStem: 2, undouble: false },
  { suffix: 'ing', replacements: ['', 'e'], minStem: 2, undouble: true },
  { suffix: 'ed', replacements: ['', 'e'], minStem: 2, undouble: true },
  { suffix: 'es', replacements: ['', 'e'], minStem: 2, undouble: false },
  { suffix: 's', replacements: [''], minStem: 2, undouble: false },
];

function endsWithDoubledConsonant(stem: string): boolean {
  if (stem.length < 2) return false;
  const last = stem[stem.length - 1] as string;
  return last === stem[stem.length - 2] && !'aeiou'.includes(last);
}

/** Best-effort lemma for CEFR lookup: the token itself, or a de-inflected form. */
export function toLemma(token: string): string {
  if (lookupCefrLevel(token)) return token;

  for (const { suffix, replacements, minStem, undouble } of LEMMA_RULES) {
    if (!token.endsWith(suffix) || token.length - suffix.length < minStem) continue;

    const stem = token.slice(0, token.length - suffix.length);
    const candidates = [...replacements.map((r) => stem + r)];
    if (undouble && endsWithDoubledConsonant(stem)) {
      candidates.push(stem.slice(0, -1));
    }

    for (const candidate of candidates) {
      if (lookupCefrLevel(candidate)) return candidate;
    }
  }

  return token;
}

/** CEFR level of a raw token after lemmatisation, or null if not in the lexicon. */
export function tokenCefrLevel(token: string): CefrLevel | null {
  return lookupCefrLevel(toLemma(token));
}

/**
 * Closed-class grammatical words plus common ad-libs. The vocabulary layer
 * profiles CONTENT words only — every English text is ~35% function words, all
 * trivially A1, so averaging over them would compress the difficulty range and
 * make ADVANCED nearly unreachable. Excluding them (as real CEFR text-profilers
 * do) lets the 60%-weighted layer actually span 0–10.
 */
const FUNCTION_WORDS: ReadonlySet<string> = new Set([
  // articles & determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'no', 'not', 'all', 'some',
  'any', 'each', 'every', 'both', 'either', 'neither', 'more', 'most', 'much', 'many',
  'few', 'such', 'own', 'one', 'two', 'three',
  // pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
  'who', 'whom', 'whose', 'which', 'what', 'whatever', 'whoever',
  // be / auxiliaries / modals
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being', 'do', 'does', 'did', 'done',
  'have', 'has', 'had', 'having', 'will', 'would', 'shall', 'should', 'can', 'could',
  'may', 'might', 'must', 'ought', 'need', 'dare',
  // prepositions
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'onto', 'upon',
  'up', 'down', 'over', 'under', 'out', 'off', 'about', 'as', 'than', 'through',
  'above', 'below', 'between', 'beneath', 'beyond', 'across', 'along', 'around',
  // conjunctions & connectives
  'and', 'or', 'but', 'so', 'if', 'because', 'while', 'though', 'although', 'when',
  'where', 'why', 'how', 'until', 'unless', 'whether', 'nor', 'yet', 'then', 'else',
  // common adverbs / fillers / ad-libs
  'there', 'here', 'now', 'just', 'too', 'very', 'also', 'even', 'ever', 'never',
  'oh', 'yeah', 'yea', 'ooh', 'ooo', 'woah', 'whoa', 'la', 'na', 'hey', 'uh', 'mmm', 'em',
]);

export function isContentWord(token: string): boolean {
  return !FUNCTION_WORDS.has(token);
}
