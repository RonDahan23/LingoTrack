/**
 * Irregular English morphology — the forms no suffix rule can derive.
 *
 * Deliberately a curated seed, exactly like src/config/cefr.ts: it covers the
 * high-frequency irregulars that actually show up in song lyrics. A word that
 * isn't here falls through to the regular rules in inflect.ts, which is a safe
 * default (worst case the learner sees a slightly wrong extra form, never a
 * crash). Grow the tables rather than adding special cases downstream.
 */

export interface IrregularVerb {
  /** Base / infinitive stem, e.g. "go". */
  base: string;
  /** Simple past, e.g. "went". */
  past: string;
  /** Past participle, e.g. "gone". */
  participle: string;
  /** Present participle when it isn't base+ing (rare; e.g. "be" -> "being"). */
  gerund?: string;
  /** Third person singular when irregular, e.g. "has", "is", "does". */
  thirdPerson?: string;
}

/** ~120 highest-frequency irregular verbs. */
export const IRREGULAR_VERBS: readonly IrregularVerb[] = [
  { base: 'be', past: 'was', participle: 'been', gerund: 'being', thirdPerson: 'is' },
  { base: 'have', past: 'had', participle: 'had', thirdPerson: 'has' },
  { base: 'do', past: 'did', participle: 'done', thirdPerson: 'does' },
  { base: 'say', past: 'said', participle: 'said' },
  { base: 'go', past: 'went', participle: 'gone' },
  { base: 'get', past: 'got', participle: 'gotten' },
  { base: 'make', past: 'made', participle: 'made' },
  { base: 'know', past: 'knew', participle: 'known' },
  { base: 'think', past: 'thought', participle: 'thought' },
  { base: 'take', past: 'took', participle: 'taken' },
  { base: 'see', past: 'saw', participle: 'seen' },
  { base: 'come', past: 'came', participle: 'come' },
  { base: 'want', past: 'wanted', participle: 'wanted' },
  { base: 'give', past: 'gave', participle: 'given' },
  { base: 'find', past: 'found', participle: 'found' },
  { base: 'tell', past: 'told', participle: 'told' },
  { base: 'feel', past: 'felt', participle: 'felt' },
  { base: 'become', past: 'became', participle: 'become' },
  { base: 'leave', past: 'left', participle: 'left' },
  { base: 'put', past: 'put', participle: 'put' },
  { base: 'mean', past: 'meant', participle: 'meant' },
  { base: 'keep', past: 'kept', participle: 'kept' },
  { base: 'let', past: 'let', participle: 'let' },
  { base: 'begin', past: 'began', participle: 'begun' },
  { base: 'seem', past: 'seemed', participle: 'seemed' },
  { base: 'hold', past: 'held', participle: 'held' },
  { base: 'bring', past: 'brought', participle: 'brought' },
  { base: 'write', past: 'wrote', participle: 'written' },
  { base: 'stand', past: 'stood', participle: 'stood' },
  { base: 'hear', past: 'heard', participle: 'heard' },
  { base: 'let', past: 'let', participle: 'let' },
  { base: 'lose', past: 'lost', participle: 'lost' },
  { base: 'pay', past: 'paid', participle: 'paid' },
  { base: 'meet', past: 'met', participle: 'met' },
  { base: 'run', past: 'ran', participle: 'run' },
  { base: 'sit', past: 'sat', participle: 'sat' },
  { base: 'speak', past: 'spoke', participle: 'spoken' },
  { base: 'lie', past: 'lay', participle: 'lain' },
  { base: 'lead', past: 'led', participle: 'led' },
  { base: 'read', past: 'read', participle: 'read' },
  { base: 'grow', past: 'grew', participle: 'grown' },
  { base: 'understand', past: 'understood', participle: 'understood' },
  { base: 'walk', past: 'walked', participle: 'walked' },
  { base: 'win', past: 'won', participle: 'won' },
  { base: 'teach', past: 'taught', participle: 'taught' },
  { base: 'catch', past: 'caught', participle: 'caught' },
  { base: 'draw', past: 'drew', participle: 'drawn' },
  { base: 'choose', past: 'chose', participle: 'chosen' },
  { base: 'break', past: 'broke', participle: 'broken' },
  { base: 'spend', past: 'spent', participle: 'spent' },
  { base: 'send', past: 'sent', participle: 'sent' },
  { base: 'build', past: 'built', participle: 'built' },
  { base: 'fall', past: 'fell', participle: 'fallen' },
  { base: 'cut', past: 'cut', participle: 'cut' },
  { base: 'rise', past: 'rose', participle: 'risen' },
  { base: 'drive', past: 'drove', participle: 'driven' },
  { base: 'buy', past: 'bought', participle: 'bought' },
  { base: 'wear', past: 'wore', participle: 'worn' },
  { base: 'sell', past: 'sold', participle: 'sold' },
  { base: 'eat', past: 'ate', participle: 'eaten' },
  { base: 'drink', past: 'drank', participle: 'drunk' },
  { base: 'sing', past: 'sang', participle: 'sung' },
  { base: 'sleep', past: 'slept', participle: 'slept' },
  { base: 'fly', past: 'flew', participle: 'flown' },
  { base: 'forget', past: 'forgot', participle: 'forgotten' },
  { base: 'throw', past: 'threw', participle: 'thrown' },
  { base: 'hide', past: 'hid', participle: 'hidden' },
  { base: 'shake', past: 'shook', participle: 'shaken' },
  { base: 'steal', past: 'stole', participle: 'stolen' },
  { base: 'ride', past: 'rode', participle: 'ridden' },
  { base: 'blow', past: 'blew', participle: 'blown' },
  { base: 'burn', past: 'burned', participle: 'burned' },
  { base: 'tear', past: 'tore', participle: 'torn' },
  { base: 'swim', past: 'swam', participle: 'swum' },
  { base: 'freeze', past: 'froze', participle: 'frozen' },
  { base: 'hurt', past: 'hurt', participle: 'hurt' },
  { base: 'hit', past: 'hit', participle: 'hit' },
  { base: 'hang', past: 'hung', participle: 'hung' },
  { base: 'shoot', past: 'shot', participle: 'shot' },
  { base: 'bite', past: 'bit', participle: 'bitten' },
  { base: 'beat', past: 'beat', participle: 'beaten' },
  { base: 'bend', past: 'bent', participle: 'bent' },
  { base: 'feed', past: 'fed', participle: 'fed' },
  { base: 'fight', past: 'fought', participle: 'fought' },
  { base: 'forgive', past: 'forgave', participle: 'forgiven' },
  { base: 'hurt', past: 'hurt', participle: 'hurt' },
  { base: 'lay', past: 'laid', participle: 'laid' },
  { base: 'light', past: 'lit', participle: 'lit' },
  { base: 'ring', past: 'rang', participle: 'rung' },
  { base: 'seek', past: 'sought', participle: 'sought' },
  { base: 'shine', past: 'shone', participle: 'shone' },
  { base: 'shut', past: 'shut', participle: 'shut' },
  { base: 'slide', past: 'slid', participle: 'slid' },
  { base: 'spread', past: 'spread', participle: 'spread' },
  { base: 'stick', past: 'stuck', participle: 'stuck' },
  { base: 'strike', past: 'struck', participle: 'struck' },
  { base: 'swear', past: 'swore', participle: 'sworn' },
  { base: 'sweep', past: 'swept', participle: 'swept' },
  { base: 'wake', past: 'woke', participle: 'woken' },
  { base: 'weep', past: 'wept', participle: 'wept' },
  { base: 'bear', past: 'bore', participle: 'borne' },
  { base: 'cost', past: 'cost', participle: 'cost' },
  { base: 'deal', past: 'dealt', participle: 'dealt' },
  { base: 'dig', past: 'dug', participle: 'dug' },
  { base: 'dream', past: 'dreamed', participle: 'dreamed' },
  { base: 'set', past: 'set', participle: 'set' },
  { base: 'quit', past: 'quit', participle: 'quit' },
  { base: 'prove', past: 'proved', participle: 'proven' },
  { base: 'ban', past: 'banned', participle: 'banned' },
];

/** Irregular noun plurals (singular -> plural). */
export const IRREGULAR_PLURALS: Readonly<Record<string, string>> = {
  man: 'men',
  woman: 'women',
  child: 'children',
  person: 'people',
  foot: 'feet',
  tooth: 'teeth',
  goose: 'geese',
  mouse: 'mice',
  louse: 'lice',
  ox: 'oxen',
  life: 'lives',
  knife: 'knives',
  wife: 'wives',
  leaf: 'leaves',
  half: 'halves',
  shelf: 'shelves',
  wolf: 'wolves',
  thief: 'thieves',
  self: 'selves',
  loaf: 'loaves',
  calf: 'calves',
  scarf: 'scarves',
  potato: 'potatoes',
  tomato: 'tomatoes',
  hero: 'heroes',
  echo: 'echoes',
  cactus: 'cacti',
  crisis: 'crises',
  analysis: 'analyses',
  datum: 'data',
  medium: 'media',
  phenomenon: 'phenomena',
  criterion: 'criteria',
};

/** Nouns whose plural equals the singular. */
export const INVARIANT_PLURALS: ReadonlySet<string> = new Set([
  'sheep',
  'deer',
  'fish',
  'series',
  'species',
  'aircraft',
  'means',
  'offspring',
  'salmon',
  'trout',
]);

/**
 * Mass nouns that have no plural at all. Generating "musics" would teach the
 * learner something false, so inflect.ts omits the plural entirely for these.
 */
export const UNCOUNTABLE_NOUNS: ReadonlySet<string> = new Set([
  'music',
  'water',
  'money',
  'love',
  'time',
  'air',
  'fire',
  'blood',
  'rain',
  'snow',
  'light',
  'darkness',
  'pain',
  'hope',
  'fear',
  'peace',
  'freedom',
  'happiness',
  'sadness',
  'advice',
  'information',
  'knowledge',
  'news',
  'furniture',
  'luggage',
  'weather',
  'homework',
  'progress',
  'traffic',
  'trouble',
  'truth',
  'youth',
  'silence',
  'sorrow',
  'courage',
  'beauty',
]);

/** Irregular comparative/superlative adjectives. */
export const IRREGULAR_COMPARATIVES: Readonly<
  Record<string, { comparative: string; superlative: string }>
> = {
  good: { comparative: 'better', superlative: 'best' },
  bad: { comparative: 'worse', superlative: 'worst' },
  far: { comparative: 'further', superlative: 'furthest' },
  little: { comparative: 'less', superlative: 'least' },
  much: { comparative: 'more', superlative: 'most' },
  many: { comparative: 'more', superlative: 'most' },
};

/** Adverbs that aren't base+ly. */
export const IRREGULAR_ADVERBS: Readonly<Record<string, string>> = {
  good: 'well',
  fast: 'fast',
  hard: 'hard',
  late: 'late',
  early: 'early',
  straight: 'straight',
};

/**
 * Two-syllable verbs whose final consonant doubles because the stress falls on
 * the last syllable. The generic CVC heuristic in inflect.ts only fires for
 * short words, so these need naming explicitly (prefer -> preferred).
 */
export const STRESS_DOUBLING_VERBS: ReadonlySet<string> = new Set([
  'begin',
  'prefer',
  'refer',
  'occur',
  'admit',
  'permit',
  'submit',
  'commit',
  'omit',
  'transmit',
  'control',
  'patrol',
  'compel',
  'expel',
  'rebel',
  'repel',
  'forget',
  'regret',
  'upset',
  'reset',
  'equip',
  'kidnap',
  'propel',
]);

/**
 * Verbs ending in a single consonant that do NOT double, despite matching the
 * CVC shape — mostly because the final syllable is unstressed.
 */
export const NO_DOUBLING_VERBS: ReadonlySet<string> = new Set([
  'open',
  'happen',
  'listen',
  'offer',
  'suffer',
  'answer',
  'enter',
  'gather',
  'wander',
  'visit',
  'limit',
  'profit',
  'benefit',
  'target',
  'budget',
  'develop',
  'envelop',
  'travel',
  'cancel',
  'label',
  'signal',
  'total',
  'focus',
  'bias',
]);

// ---------------------------------------------------------------------------
// Lookup indexes, built once at module load (mirrors cefr.ts's LEXICON IIFE).
// ---------------------------------------------------------------------------

const VERBS_BY_BASE: ReadonlyMap<string, IrregularVerb> = (() => {
  const map = new Map<string, IrregularVerb>();
  // First entry wins, so an accidental duplicate keeps the earlier definition.
  for (const verb of IRREGULAR_VERBS) {
    if (!map.has(verb.base)) map.set(verb.base, verb);
  }
  return map;
})();

/**
 * Every irregular surface form mapped back to its base. Used by the lemmatizer
 * so "went" resolves to "go" instead of being treated as an unknown word.
 */
const BASE_BY_FORM: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const verb of IRREGULAR_VERBS) {
    const forms = [verb.past, verb.participle, verb.gerund, verb.thirdPerson];
    for (const form of forms) {
      if (form && !map.has(form)) map.set(form, verb.base);
    }
  }
  // Irregular plurals and comparatives resolve back to their base too.
  for (const [singular, plural] of Object.entries(IRREGULAR_PLURALS)) {
    if (!map.has(plural)) map.set(plural, singular);
  }
  for (const [base, forms] of Object.entries(IRREGULAR_COMPARATIVES)) {
    if (!map.has(forms.comparative)) map.set(forms.comparative, base);
    if (!map.has(forms.superlative)) map.set(forms.superlative, base);
  }
  // "was"/"were"/"am"/"are" all belong to "be".
  for (const form of ['were', 'am', 'are', 'been', 'being']) map.set(form, 'be');
  return map;
})();

export function lookupIrregularVerb(base: string): IrregularVerb | null {
  return VERBS_BY_BASE.get(base) ?? null;
}

/** Resolves an irregular surface form to its base, or null if not irregular. */
export function baseOfIrregularForm(form: string): string | null {
  return BASE_BY_FORM.get(form) ?? null;
}

/** True when the word is a known irregular verb in any of its forms. */
export function isKnownVerb(word: string): boolean {
  return VERBS_BY_BASE.has(word) || BASE_BY_FORM.has(word);
}
