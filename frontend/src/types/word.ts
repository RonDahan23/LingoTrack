/** Learning states a saved word moves through. Mirrors the backend's WORD_STATUSES. */
export type WordStatus = 'LEARNING' | 'REVIEW' | 'MASTERED';

export type PartOfSpeech = 'NOUN' | 'VERB' | 'ADJECTIVE' | 'ADVERB' | 'OTHER' | 'UNKNOWN';

/** Grammatical label of a family member. Mirrors the backend's FORM_LABELS. */
export type FormLabel =
  | 'base'
  | 'infinitive'
  | 'third_person'
  | 'gerund'
  | 'past'
  | 'past_participle'
  | 'agent_noun'
  | 'singular'
  | 'plural'
  | 'comparative'
  | 'superlative'
  | 'adverb';

export interface WordForm {
  form: string;
  label: FormLabel;
}

/** A saved word: enrichment + spaced-repetition state. Shape of GET /api/words. */
export interface WordBankEntry {
  id: string;
  word: string;
  lemma: string;
  root: string;
  translation: string;
  partOfSpeech: PartOfSpeech;
  cefrLevel: string | null;
  forms: WordForm[];
  contextLine: string | null;
  trackId: string | null;
  status: WordStatus;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  attemptCount: number;
  correctCount: number;
  /** 0–1 progress toward mastery. */
  mastery: number;
  /** Share of answers correct, or null before the first attempt. */
  accuracy: number | null;
  createdAt: string;
}

export interface WordBankStats {
  total: number;
  learning: number;
  review: number;
  mastered: number;
  due: number;
  accuracy: number | null;
}

export type ExerciseType = 'MCQ_EN_TO_HE' | 'MCQ_HE_TO_EN' | 'FILL_BLANK' | 'FORM_MATCH';

/** One quiz question. Every type answers with an index into `options`. */
export interface Exercise {
  id: string;
  wordId: string;
  type: ExerciseType;
  prompt: string;
  /** FILL_BLANK only: the lyric line with the target replaced by a blank. */
  sentence?: string;
  options: string[];
  answerIndex: number;
  word: string;
  translation: string;
  formLabel?: FormLabel;
}

export interface ReviewHistoryPoint {
  reviewedAt: string;
  correct: boolean;
  exerciseType: string;
}

/**
 * Status labels, colours, and order — the single source for word-bank chrome,
 * exactly like DIFFICULTY_META in types/track.ts.
 *
 * Tailwind class names are written as FULL STRING LITERALS: the JIT scanner
 * only sees classes that appear verbatim in source, so a concatenated name
 * would be purged from the production build.
 */
export const WORD_STATUS_ORDER: WordStatus[] = ['LEARNING', 'REVIEW', 'MASTERED'];

export const WORD_STATUS_META: Record<
  WordStatus,
  { label: string; text: string; badge: string; bar: string; activeTab: string }
> = {
  LEARNING: {
    label: 'Learning',
    text: 'text-amber-300',
    badge: 'bg-amber-500/15 text-amber-300',
    bar: 'bg-amber-500',
    activeTab: 'border-amber-400 text-amber-300',
  },
  REVIEW: {
    label: 'Review',
    text: 'text-sky-300',
    badge: 'bg-sky-500/15 text-sky-300',
    bar: 'bg-sky-500',
    activeTab: 'border-sky-400 text-sky-300',
  },
  MASTERED: {
    label: 'Mastered',
    text: 'text-emerald-300',
    badge: 'bg-emerald-500/15 text-emerald-300',
    bar: 'bg-emerald-500',
    activeTab: 'border-emerald-400 text-emerald-300',
  },
};

/**
 * Hebrew names for the grammatical forms and parts of speech shown on a word
 * card.
 *
 * The metalanguage is Hebrew because the learner is a Hebrew speaker; the
 * English words themselves obviously stay English — they are the thing being
 * learned. Terms follow what English is taught with in Israeli schools
 * ("צורה שלישית" for the past participle, not the linguist's "בינוני פעול"),
 * so a card reads the way a classroom would explain it.
 *
 * Anywhere one of these sits inline next to an English word, wrap it in
 * `<bdi>` — otherwise the quotes and dashes around it get reordered by the
 * bidi algorithm. Flex items are already isolated and need no wrapper.
 */
export const FORM_LABEL_NAMES: Record<FormLabel, string> = {
  base: 'בסיס',
  infinitive: 'שם הפועל',
  third_person: 'הוא/היא',
  gerund: 'צורת ‎-ing',
  past: 'עבר',
  past_participle: 'צורה שלישית',
  agent_noun: 'מבצע הפעולה',
  singular: 'יחיד',
  plural: 'רבים',
  comparative: 'יתרון',
  superlative: 'הפלגה',
  adverb: 'תואר הפועל',
};

export const PART_OF_SPEECH_NAMES: Record<PartOfSpeech, string> = {
  NOUN: 'שם עצם',
  VERB: 'פועל',
  ADJECTIVE: 'שם תואר',
  ADVERB: 'תואר הפועל',
  OTHER: 'אחר',
  UNKNOWN: '',
};
