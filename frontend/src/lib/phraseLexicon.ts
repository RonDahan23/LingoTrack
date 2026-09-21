/**
 * Multi-word expressions worth recognising in lyrics.
 *
 * A curated seed, not a complete idiom dictionary — the same posture as the
 * backend's CEFR lexicon. A phrase that is missing simply falls back to
 * single-word behaviour; nothing breaks, the learner just gets less help.
 *
 * `he` is present only where machine translation gets the phrase WRONG. That
 * distinction is the whole point of the field, and it is not hypothetical:
 * Google renders "no offense" as "ללא עבירה" — *without a crime* — which is
 * how this feature came to be requested. Where the machine is right ("clap
 * along" → "למחוא כפיים"), `he` is deliberately left off and the phrase goes
 * through the normal cached translation API, so the lexicon stays small
 * instead of rotting into a second translation memory.
 */

/**
 * Optional slot for a determiner or possessive: "lay [DET] eyes on" matches
 * both "lay eyes on" and "laid your eyes on".
 *
 * Defined here rather than in phrases.ts so the dependency runs one way —
 * the matcher imports the lexicon, never the reverse. As a cycle, this
 * sentinel was still undefined while the entries below were being built, and
 * every pattern containing it silently held a hole.
 */
export const DET = '[DET]';

export const DETERMINERS = new Set([
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'this',
  'that', 'these', 'those', 'some', 'any', 'no',
]);

/**
 * Particles that turn a preceding verb into a phrasal verb.
 *
 * Only true particles — general prepositions ("of", "at", "for") are left out
 * on purpose, because admitting them would make "king of the world" and "tired
 * of the way" look like phrases.
 */
export const PARTICLES = new Set([
  'up', 'down', 'out', 'off', 'away', 'back', 'over', 'on', 'in', 'along',
  'through', 'around', 'apart', 'together', 'ahead', 'aside', 'forward',
]);

/**
 * Words that cannot head a phrasal verb. Without this, "I'm back", "that's on
 * me" and "the way out" would all be read as verb + particle.
 */
export const NOT_PHRASAL_HEADS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
  'her', 'its', 'our', 'their', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'us', 'them', 'is', 'are', 'was', 'were', 'am', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'can', 'could', 'may', 'might', 'must', 'and', 'or', 'but', 'so',
  'if', 'than', 'then', 'of', 'for', 'with', 'from', 'at', 'to', 'as', 'not',
  "i'm", "you're", "he's", "she's", "it's", "we're", "they're", "that's",
  "there's", "don't", "won't", "can't", "ain't", 'no', 'yes', 'oh',
]);

export interface PhraseEntry {
  /**
   * Ordered slots. Each is either pipe-separated surface alternatives or the
   * DET sentinel for an optional determiner/possessive.
   */
  pattern: string[];
  /** Curated Hebrew. Omitted when the phrase translates compositionally. */
  he?: string;
}

/**
 * Expands a verb to its inflected surface forms, because a phrase has to match
 * the line as sung: "laid your eyes on me", not "lay eyes on".
 *
 * Irregular past/participle forms are passed explicitly — there is no reliable
 * rule for them, and guessing would silently fail to match the exact lines
 * this feature exists to catch.
 */
export function v(base: string, ...irregular: string[]): string {
  const forms = new Set<string>([base, ...irregular]);

  forms.add(
    /(?:s|x|z|ch|sh)$/.test(base)
      ? `${base}es`
      : /[^aeiou]y$/.test(base)
        ? `${base.slice(0, -1)}ies`
        : `${base}s`,
  );

  // Single-syllable consonant-vowel-consonant verbs double the final letter:
  // slip -> slipping, not "sliping".
  const doubled = /^[^aeiou]*[aeiou][bdgklmnprtvz]$/.test(base) ? base + base.slice(-1) : base;

  forms.add(
    /e$/.test(base) && !/(?:ee|ye|oe)$/.test(base)
      ? `${base.slice(0, -1)}ing`
      : `${doubled}ing`,
  );

  // Only add the regular past when no irregular one was supplied.
  if (irregular.length === 0) {
    forms.add(
      /e$/.test(base)
        ? `${base}d`
        : /[^aeiou]y$/.test(base)
          ? `${base.slice(0, -1)}ied`
          : `${doubled}ed`,
    );
  }

  return [...forms].join('|');
}

const p = (pattern: string[], he?: string): PhraseEntry => (he ? { pattern, he } : { pattern });

export const PHRASES: PhraseEntry[] = [
  // ---- idioms the machine gets wrong; the curated Hebrew is load-bearing ----
  p(['no', 'offense|offence'], 'בלי להעליב'),
  p([v('lay', 'laid'), DET, 'eyes', 'on'], 'לשים עין על, להביט ב'),
  p(['once', 'in', 'a', 'while'], 'מדי פעם'),
  p(['all', 'along'], 'כל הזמן, לאורך כל הדרך'),
  p(['after', 'all'], 'אחרי הכול'),
  p(['for', 'good'], 'לתמיד'),
  p(['in', 'vain'], 'לשווא'),
  p(['no', 'matter'], 'לא משנה'),
  p(['on', 'my|your|his|her|our|their', 'own'], 'לבד, בכוחות עצמי'),
  p(['out', 'of', DET, 'mind'], 'יוצא מדעתו, משוגע'),
  p(['over', 'and', 'over'], 'שוב ושוב'),
  p(['time', 'after', 'time'], 'פעם אחר פעם'),
  p(['side', 'by', 'side'], 'זה לצד זה'),
  p(['sooner', 'or', 'later'], 'במוקדם או במאוחר'),
  p(['take', 'it', 'easy'], 'לקחת בקלות, להירגע'),
  p(['never', 'mind'], 'לא חשוב, עזוב'),
  p([v('make', 'made'), 'sense'], 'להיות הגיוני'),
  p([v('come', 'came'), 'true'], 'להתגשם'),
  p([v('fall', 'fell', 'fallen'), 'in', 'love'], 'להתאהב'),
  p([v('break', 'broke', 'broken'), 'free'], 'להשתחרר'),
  p([v('set', 'set'), 'free'], 'לשחרר'),
  p(['as', 'long', 'as'], 'כל עוד'),
  p(['even', 'though'], 'למרות ש'),
  p(['up', 'to', 'you|me|him|her|us|them'], 'תלוי בך'),
  p(['on', 'fire'], 'בוער, בלהבות'),
  p(['ups', 'and', 'downs'], 'עליות ומורדות'),
  p(['through', 'and', 'through'], 'לחלוטין, מכל וכל'),
  p(['the', 'other', 'way', 'around'], 'הפוך'),
  p([v('hold', 'held'), 'tight'], 'להחזיק חזק'),
  p([v('hold', 'held'), 'on'], 'להחזיק מעמד, לחכות'),
  p([v('hold', 'held'), 'back'], 'לעצור, להתאפק'),
  p([v('let', 'let'), 'go'], 'לשחרר, להרפות'),
  p([v('let', 'let'), 'down'], 'לאכזב'),
  p([v('give', 'gave', 'given'), 'up'], 'לוותר'),
  p([v('give', 'gave', 'given'), 'in'], 'להיכנע'),
  p([v('get', 'got', 'gotten'), 'over'], 'להתגבר על'),
  p([v('get', 'got', 'gotten'), 'by'], 'להסתדר, לשרוד'),
  p([v('get', 'got', 'gotten'), 'along'], 'להסתדר עם'),
  p([v('figure'), 'out'], 'להבין, לפענח'),
  p([v('fall', 'fell', 'fallen'), 'apart'], 'להתפרק, להישבר'),
  p([v('fall', 'fell', 'fallen'), 'for'], 'להתאהב ב'),
  p([v('break', 'broke', 'broken'), 'down'], 'להישבר, להתמוטט'),
  p([v('break', 'broke', 'broken'), 'up'], 'להיפרד'),
  p([v('make', 'made'), 'up'], 'להתפייס, להמציא'),
  p([v('show', 'showed', 'shown'), 'up'], 'להופיע, להגיע'),
  p([v('run', 'ran'), 'out', 'of'], 'להיגמר, לאזול'),
  p([v('run', 'ran'), 'into'], 'להיתקל ב'),
  p([v('put', 'put'), 'up', 'with'], 'לסבול, לשאת'),
  p([v('pass'), 'away'], 'להיפטר, למות'),
  p([v('move'), 'on'], 'להמשיך הלאה'),
  p([v('carry'), 'on'], 'להמשיך'),
  p([v('stand', 'stood'), 'out'], 'לבלוט'),
  p([v('turn'), 'down'], 'לדחות, להנמיך'),
  p([v('work'), 'out'], 'להסתדר, להתאמן'),
  p([v('reach'), 'out'], 'לפנות, להושיט יד'),
  p([v('slip'), 'away'], 'לחמוק, להיעלם'),
  p([v('tear', 'tore', 'torn'), 'apart'], 'לקרוע לגזרים'),
  p([v('wear', 'wore', 'worn'), 'out'], 'לשחוק, להתיש'),
  p([v('blow', 'blew', 'blown'), 'away'], 'להדהים'),
  p([v('fire'), 'up'], 'נלהב, מלא מרץ'),
  p([v('burn'), 'out'], 'להישרף, להתיש'),
  p([v('hold', 'held'), 'up'], 'לעכב, לחכות'),
  // "to" is not a particle (see PARTICLES), so this needs an explicit entry.
  // The machine renders "tend to" as נוטים — plural, and dropping the "to".
  p([v('tend'), 'to'], 'נוטה ל־, נוטה'),
  p([v('calm'), 'down'], 'להירגע'),
  p([v('count'), 'on'], 'לסמוך על'),
  p([v('deal', 'dealt'), 'with'], 'להתמודד עם'),
  p([v('hang', 'hung'), 'out'], 'לבלות'),
  p([v('hang', 'hung'), 'on'], 'לחכות, להחזיק חזק'),
  p([v('keep', 'kept'), 'up'], 'לעמוד בקצב'),
  p([v('look'), 'after'], 'לטפל ב'),
  p([v('look'), 'forward', 'to'], 'לצפות בקוצר רוח ל'),
  p([v('miss'), 'out'], 'להחמיץ'),
  p([v('settle'), 'down'], 'להירגע, להתיישב'),
  p([v('watch'), 'out'], 'להיזהר'),
  p([v('chase'), 'after'], 'לרדוף אחרי'),
  p([v('stay'), 'up'], 'להישאר ער'),

  // ---- compositional: the machine translates these correctly on its own ----
  p([v('clap'), 'along']),
  p([v('sing', 'sang', 'sung'), 'along']),
  p([v('come', 'came'), 'along']),
  p([v('waste'), DET, 'time']),
  p([v('wake', 'woke', 'woken'), 'up']),
  p([v('take', 'took', 'taken'), 'off']),
  p([v('throw', 'threw', 'thrown'), 'away']),
  p([v('pick'), 'up']),
  p([v('feel', 'felt'), 'like']),
  p(['right', 'now']),
  p(['so', 'far']),
  p(['at', 'all']),
  p(['by', 'the', 'way']),
  p(['what', 'if']),
  p(['out', 'of', 'time']),
];
