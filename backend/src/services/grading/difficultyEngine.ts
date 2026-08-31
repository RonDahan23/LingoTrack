import {
  DIFFICULTY_WEIGHTS,
  MAX_DIFFICULTY_SCORE,
  MIN_DIFFICULTY_SCORE,
  toDifficultyLevel,
  type DifficultyLevel,
} from '../../config/difficulty.js';
import { LEVEL_DIFFICULTY, UNKNOWN_WORD_DIFFICULTY } from '../../config/cefr.js';
import { isContentWord, tokenCefrLevel, tokenize } from './tokenizer.js';

/**
 * The difficulty engine — ARCHITECTURE.md §3.
 *
 * Turns a track's lyric lines (+ total duration) into a 0–10 score built from
 * three weighted layers, then the persisted BEGINNER/INTERMEDIATE/ADVANCED
 * bucket. Pure and deterministic: no I/O, no clock, same input → same output,
 * which is what makes it unit-testable.
 */

export interface GradingInput {
  /** Ordered lyric line texts. Timestamps are irrelevant to grading. */
  lines: string[];
  /** Total track length in ms, for words-per-minute. Null → neutral audio score. */
  durationMs: number | null;
}

export interface LayerBreakdown {
  vocabulary: number;
  textComplexity: number;
  audioDynamics: number;
}

export interface GradingResult {
  score: number;
  level: DifficultyLevel;
  layers: LayerBreakdown;
  wordCount: number;
}

/** Neutral score used when a layer has no signal (e.g. missing duration). */
const NEUTRAL = 5.0;

function clamp(value: number, min = MIN_DIFFICULTY_SCORE, max = MAX_DIFFICULTY_SCORE): number {
  return Math.min(max, Math.max(min, value));
}

/** Maps a value in [lo, hi] onto [0, 10], clamping outside the band. */
function scaleTo10(value: number, lo: number, hi: number): number {
  if (hi === lo) return NEUTRAL;
  return clamp(((value - lo) / (hi - lo)) * MAX_DIFFICULTY_SCORE);
}

/**
 * Layer 1 (60%): mean CEFR difficulty of the CONTENT words. Function words are
 * excluded so the trivial-but-frequent grammatical scaffolding doesn't compress
 * the range (see FUNCTION_WORDS). Unknown content words count as near-C2. A song
 * whose content words are all A1 lands near 0.5; one thick with rare vocabulary
 * approaches 10. Falls back to all tokens for an all-function-word line.
 */
export function scoreVocabulary(tokens: string[]): number {
  if (tokens.length === 0) return NEUTRAL;

  const content = tokens.filter(isContentWord);
  const profiled = content.length > 0 ? content : tokens;

  let total = 0;
  for (const token of profiled) {
    const level = tokenCefrLevel(token);
    total += level ? LEVEL_DIFFICULTY[level] : UNKNOWN_WORD_DIFFICULTY;
  }
  return clamp(total / profiled.length);
}

/**
 * Layer 2 (20%): text complexity from three equally-weighted signals — word
 * sophistication (mean content-word length), lexical diversity (type-token
 * ratio), and density of advanced grammar (perfect / passive constructions).
 *
 * NOTE: this deliberately does NOT use line length. Synced lyrics (LRC) break a
 * song into short line fragments (~4 words), so an average-words-per-line signal
 * scored even the fastest, densest rap as "simple" and capped the whole engine
 * below ADVANCED. Word length tracks real vocabulary difficulty (long words like
 * "redemption" vs "love") without penalising short lines.
 */
export function scoreTextComplexity(lines: string[], tokens: string[]): number {
  const nonEmpty = lines.filter((l) => tokenize(l).length > 0);
  if (nonEmpty.length === 0 || tokens.length === 0) return NEUTRAL;

  // (a) Word sophistication: mean length of CONTENT words. ~4 chars is simple
  // pop ("love", "you"); ~7+ is dense vocabulary ("redemption", "labyrinth").
  const contentWords = tokens.filter(isContentWord);
  const profiled = contentWords.length > 0 ? contentWords : tokens;
  const avgWordLength = profiled.reduce((sum, w) => sum + w.length, 0) / profiled.length;
  const wordLengthScore = scaleTo10(avgWordLength, 4, 7);

  // (b) Lexical diversity: repetitive hooks reuse words (low TTR); wordy verse
  // introduces many distinct ones (high TTR).
  const distinct = new Set(tokens).size;
  const typeTokenRatio = distinct / tokens.length;
  const diversityScore = scaleTo10(typeTokenRatio, 0.3, 0.8);

  // (c) Advanced grammar: perfect and passive constructions per line.
  const grammarHits = countAdvancedGrammar(nonEmpty);
  const grammarScore = scaleTo10(grammarHits / nonEmpty.length, 0, 0.5);

  return clamp((wordLengthScore + diversityScore + grammarScore) / 3);
}

/** Auxiliary + past participle → perfect or passive. Coarse but corpus-robust. */
const ADVANCED_GRAMMAR =
  /\b(have|has|had|am|is|are|was|were|be|been|being)\b\s+(?:\w+ly\s+)?(\w+(?:ed|en|wn|ne))\b/gi;

export function countAdvancedGrammar(lines: string[]): number {
  let hits = 0;
  for (const line of lines) {
    const matches = line.match(ADVANCED_GRAMMAR);
    if (matches) hits += matches.length;
  }
  return hits;
}

/**
 * Layer 3 (20%): words per minute. Slow ballads (~40 wpm) grade easy; rapid
 * rap (~250+ wpm) grades hard. Returns NEUTRAL when duration is unknown so a
 * missing field neither inflates nor deflates the overall score.
 */
export function scoreAudioDynamics(wordCount: number, durationMs: number | null): number {
  if (!durationMs || durationMs <= 0 || wordCount === 0) return NEUTRAL;

  const wordsPerMinute = wordCount / (durationMs / 60_000);
  return scaleTo10(wordsPerMinute, 40, 250);
}

export function gradeTrack(input: GradingInput): GradingResult {
  const tokens = input.lines.flatMap(tokenize);

  const layers: LayerBreakdown = {
    vocabulary: scoreVocabulary(tokens),
    textComplexity: scoreTextComplexity(input.lines, tokens),
    audioDynamics: scoreAudioDynamics(tokens.length, input.durationMs),
  };

  const score = clamp(
    layers.vocabulary * DIFFICULTY_WEIGHTS.vocabulary +
      layers.textComplexity * DIFFICULTY_WEIGHTS.textComplexity +
      layers.audioDynamics * DIFFICULTY_WEIGHTS.audioDynamics,
  );

  // Round to one decimal — matches the score granularity in the §3 thresholds.
  const rounded = Math.round(score * 10) / 10;

  return {
    score: rounded,
    level: toDifficultyLevel(rounded),
    layers,
    wordCount: tokens.length,
  };
}
