/**
 * Exercise generation — pure, deterministic, no I/O.
 *
 * Turns a set of word-bank entries into a Duolingo-style session. Determinism
 * matters for two reasons: it makes the generator unit-testable, and it lets a
 * client re-request the same session (e.g. after a refresh) and get the same
 * questions instead of a reshuffled set. Randomness therefore comes from an
 * explicit seed, never Math.random.
 */

import {
  MCQ_OPTION_COUNT,
  type ExerciseType,
  type PartOfSpeech,
} from '../../config/wordBank.js';
import type { FormLabel, WordForm } from '../morphology/inflect.js';

/** A word-bank entry reduced to what the generator needs. */
export interface PracticeWord {
  id: string;
  /** Surface form as originally tapped, e.g. "climbing". */
  word: string;
  lemma: string;
  translation: string;
  contextLine: string | null;
  partOfSpeech: PartOfSpeech;
  forms: WordForm[];
}

/**
 * One question. A single flat shape across all four types — the client renders
 * from `type`, and every variant answers with an option index, so grading is
 * uniform.
 */
export interface Exercise {
  /** Stable within a session; lets the client key React lists. */
  id: string;
  wordId: string;
  type: ExerciseType;
  /** Question text, already localised into the prompt language. */
  prompt: string;
  /** For FILL_BLANK: the lyric line with the target replaced by a blank. */
  sentence?: string;
  options: string[];
  answerIndex: number;
  /** Shown after answering — the word this exercise was really about. */
  word: string;
  translation: string;
  /** For FORM_MATCH: which grammatical form was being asked for. */
  formLabel?: FormLabel;
}

export interface GenerateOptions {
  /** Max exercises to emit. */
  limit: number;
  /** Deterministic shuffle seed. */
  seed: number;
  /**
   * Extra translations usable as multiple-choice distractors, for when the
   * user's bank is too small to supply plausible wrong answers on its own.
   */
  distractorPool?: readonly { word: string; translation: string }[];
}

/** The blank placeholder used in fill-in-the-blank sentences. */
export const BLANK = '____';

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) — small, fast, good enough for shuffling.
// ---------------------------------------------------------------------------

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, on a copy. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Builds an option list: the answer plus up to n-1 distinct distractors,
 * shuffled. Returns null when there aren't enough distinct options to make a
 * meaningful question (a 1-option "choice" teaches nothing).
 */
function buildOptions(
  answer: string,
  candidates: readonly string[],
  rng: () => number,
  size = MCQ_OPTION_COUNT,
): { options: string[]; answerIndex: number } | null {
  const distractors: string[] = [];
  const seen = new Set([normalise(answer)]);
  for (const candidate of shuffle(candidates, rng)) {
    const key = normalise(candidate);
    if (!candidate.trim() || seen.has(key)) continue;
    seen.add(key);
    distractors.push(candidate);
    if (distractors.length >= size - 1) break;
  }
  if (distractors.length === 0) return null;

  const options = shuffle([answer, ...distractors], rng);
  return { options, answerIndex: options.indexOf(answer) };
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Fill-in-the-blank
// ---------------------------------------------------------------------------

/** Escapes a string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces the first whole-word occurrence of any family form in `line`.
 *
 * Tries the surface form first (that's what the singer actually sang), then
 * other single-token family members — a line captured for "climbing" might
 * literally contain "climbed". Returns null when nothing matches, which is the
 * signal to skip FILL_BLANK for this word.
 */
export function blankOutWord(
  line: string,
  surface: string,
  forms: readonly WordForm[] = [],
): { sentence: string; matched: string } | null {
  const candidates = [surface, ...forms.map((f) => f.form).filter((f) => !f.includes(' '))];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(candidate)}\\b`, 'i');
    if (pattern.test(line)) {
      return { sentence: line.replace(pattern, BLANK), matched: candidate };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-type builders. Each returns null when the word can't support the type.
// ---------------------------------------------------------------------------

function mcqEnToHe(
  word: PracticeWord,
  pool: readonly PracticeWord[],
  extra: readonly { word: string; translation: string }[],
  rng: () => number,
): Exercise | null {
  const candidates = [
    ...pool.filter((w) => w.id !== word.id).map((w) => w.translation),
    ...extra.map((e) => e.translation),
  ];
  const built = buildOptions(word.translation, candidates, rng);
  if (!built) return null;
  return {
    id: `${word.id}:MCQ_EN_TO_HE`,
    wordId: word.id,
    type: 'MCQ_EN_TO_HE',
    prompt: word.word,
    options: built.options,
    answerIndex: built.answerIndex,
    word: word.word,
    translation: word.translation,
  };
}

function mcqHeToEn(
  word: PracticeWord,
  pool: readonly PracticeWord[],
  extra: readonly { word: string; translation: string }[],
  rng: () => number,
): Exercise | null {
  const candidates = [
    ...pool.filter((w) => w.id !== word.id).map((w) => w.word),
    ...extra.map((e) => e.word),
  ];
  const built = buildOptions(word.word, candidates, rng);
  if (!built) return null;
  return {
    id: `${word.id}:MCQ_HE_TO_EN`,
    wordId: word.id,
    type: 'MCQ_HE_TO_EN',
    prompt: word.translation,
    options: built.options,
    answerIndex: built.answerIndex,
    word: word.word,
    translation: word.translation,
  };
}

function fillBlank(
  word: PracticeWord,
  pool: readonly PracticeWord[],
  rng: () => number,
): Exercise | null {
  if (!word.contextLine) return null;
  const blanked = blankOutWord(word.contextLine, word.word, word.forms);
  if (!blanked) return null;

  const candidates = pool.filter((w) => w.id !== word.id).map((w) => w.word);
  const built = buildOptions(blanked.matched, candidates, rng);
  if (!built) return null;

  return {
    id: `${word.id}:FILL_BLANK`,
    wordId: word.id,
    type: 'FILL_BLANK',
    prompt: 'Complete the lyric',
    sentence: blanked.sentence,
    options: built.options,
    answerIndex: built.answerIndex,
    word: word.word,
    translation: word.translation,
  };
}

/** Human-readable names for the grammatical forms, used in FORM_MATCH prompts. */
const LABEL_PROMPTS: Partial<Record<FormLabel, string>> = {
  base: 'base form',
  infinitive: 'infinitive',
  third_person: 'third-person singular',
  gerund: '-ing form',
  past: 'past tense',
  past_participle: 'past participle',
  agent_noun: 'person who does this',
  plural: 'plural',
  singular: 'singular',
  comparative: 'comparative',
  superlative: 'superlative',
  adverb: 'adverb',
};

/**
 * Asks for a specific grammatical form of the word's family, with the other
 * family members as distractors — so the learner has to distinguish "climbed"
 * from "climbing" rather than merely recognise the word.
 */
function formMatch(
  word: PracticeWord,
  pool: readonly PracticeWord[],
  rng: () => number,
): Exercise | null {
  const usable = word.forms.filter((f) => LABEL_PROMPTS[f.label]);
  if (usable.length < 2) return null;

  // Ask for a form OTHER than the one already shown as the prompt subject.
  const targets = usable.filter((f) => normalise(f.form) !== normalise(word.lemma));
  const target = (targets.length > 0 ? targets : usable)[
    Math.floor(rng() * (targets.length > 0 ? targets.length : usable.length))
  ] as WordForm;

  const familyDistractors = usable.filter((f) => f.form !== target.form).map((f) => f.form);
  // Top up from other words' families so a two-form family still yields choices.
  const outsideDistractors = pool
    .filter((w) => w.id !== word.id)
    .flatMap((w) => w.forms.map((f) => f.form));

  const built = buildOptions(target.form, [...familyDistractors, ...outsideDistractors], rng);
  if (!built) return null;

  return {
    id: `${word.id}:FORM_MATCH`,
    wordId: word.id,
    type: 'FORM_MATCH',
    prompt: `Which is the ${LABEL_PROMPTS[target.label]} of "${word.lemma}"?`,
    options: built.options,
    answerIndex: built.answerIndex,
    word: word.word,
    translation: word.translation,
    formLabel: target.label,
  };
}

/**
 * Preferred exercise order per word. Rotating the starting point by position
 * keeps a session varied instead of serving ten of the same type; each word
 * still falls back down the list when a type isn't buildable.
 */
const TYPE_ROTATION: readonly ExerciseType[] = [
  'MCQ_EN_TO_HE',
  'FILL_BLANK',
  'MCQ_HE_TO_EN',
  'FORM_MATCH',
];

/**
 * Builds a practice session.
 *
 * `words` should already be filtered to what's due — this function decides only
 * WHICH exercise to build for each, never which words to include. Words that
 * can't support any exercise (e.g. the bank has a single entry, so no
 * distractors exist) are skipped rather than turned into a degenerate question.
 */
export function generateExercises(
  words: readonly PracticeWord[],
  options: GenerateOptions,
): Exercise[] {
  const rng = makeRng(options.seed);
  const extra = options.distractorPool ?? [];
  const exercises: Exercise[] = [];

  for (const [index, word] of words.entries()) {
    if (exercises.length >= options.limit) break;

    const offset = index % TYPE_ROTATION.length;
    const order = [...TYPE_ROTATION.slice(offset), ...TYPE_ROTATION.slice(0, offset)];

    for (const type of order) {
      const exercise = buildExercise(type, word, words, extra, rng);
      if (exercise) {
        exercises.push(exercise);
        break;
      }
    }
  }
  return exercises;
}

function buildExercise(
  type: ExerciseType,
  word: PracticeWord,
  pool: readonly PracticeWord[],
  extra: readonly { word: string; translation: string }[],
  rng: () => number,
): Exercise | null {
  switch (type) {
    case 'MCQ_EN_TO_HE':
      return mcqEnToHe(word, pool, extra, rng);
    case 'MCQ_HE_TO_EN':
      return mcqHeToEn(word, pool, extra, rng);
    case 'FILL_BLANK':
      return fillBlank(word, pool, rng);
    case 'FORM_MATCH':
      return formMatch(word, pool, rng);
    default:
      return null;
  }
}
