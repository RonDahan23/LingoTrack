/**
 * CEFR vocabulary reference for the difficulty engine (ARCHITECTURE.md §3,
 * layer 1). Maps English lemmas to their CEFR level A1–C2.
 *
 * This is a curated SEED, not the full CEFR wordlists (which run to several
 * thousand words per level). It is weighted toward high-frequency A1/A2
 * vocabulary because that dominates song lyrics, plus representative B/C
 * entries. Words absent from the list are treated as rare/advanced by
 * `wordDifficulty()` — so expanding this map improves accuracy but its
 * incompleteness never crashes grading, it only biases unknown words upward.
 *
 * To extend: add lemmas under the appropriate level. Keep everything lowercase;
 * the tokenizer lowercases before lookup. Store base forms — `LEMMA_SUFFIXES`
 * in tokenizer.ts strips common inflections (-s, -ed, -ing) before lookup.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/**
 * Difficulty contribution of each level on the engine's 0–10 scale. Unknown
 * words score `UNKNOWN_WORD_DIFFICULTY` — high, but below C2, since an unknown
 * token is often a name or slang rather than genuinely C2 vocabulary.
 */
export const LEVEL_DIFFICULTY: Record<CefrLevel, number> = {
  A1: 0.5,
  A2: 2.0,
  B1: 4.0,
  B2: 6.0,
  C1: 8.0,
  C2: 10.0,
};

export const UNKNOWN_WORD_DIFFICULTY = 8.5;

const WORDS_BY_LEVEL: Record<CefrLevel, readonly string[]> = {
  A1: [
    'a', 'an', 'the', 'and', 'but', 'or', 'so', 'if', 'because', 'as',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
    'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'go', 'went', 'come', 'came',
    'get', 'got', 'make', 'made', 'know', 'knew', 'think', 'see', 'saw', 'want',
    'give', 'take', 'tell', 'say', 'said', 'feel', 'look', 'find', 'need', 'like',
    'love', 'hate', 'live', 'stay', 'leave', 'call', 'try', 'help', 'play', 'work',
    'good', 'bad', 'big', 'small', 'new', 'old', 'hot', 'cold', 'happy', 'sad',
    'day', 'night', 'time', 'year', 'home', 'house', 'world', 'life', 'man', 'woman',
    'boy', 'girl', 'friend', 'baby', 'heart', 'eye', 'hand', 'head', 'name', 'thing',
    'water', 'fire', 'sun', 'moon', 'sky', 'sea', 'road', 'city', 'money', 'song',
    'here', 'there', 'now', 'then', 'today', 'up', 'down', 'in', 'out', 'on', 'off',
    'to', 'of', 'for', 'with', 'from', 'at', 'by', 'not', 'no', 'yes',
    'one', 'two', 'three', 'all', 'some', 'any', 'more', 'very', 'too', 'just',
    'who', 'what', 'when', 'where', 'why', 'how', 'can', 'will', 'would', 'let',
    // High-frequency content words that pervade lyrics — without these a seed
    // lexicon would mark them "unknown" and wrongly inflate simple songs.
    'sing', 'dance', 'cry', 'laugh', 'shine', 'burn', 'grow', 'rise', 'wake',
    'sleep', 'dead', 'alive', 'gone', 'mind', 'body', 'soul', 'skin', 'blood',
    'bone', 'hair', 'face', 'arm', 'back', 'foot', 'feet', 'mouth', 'kid',
    'king', 'queen', 'god', 'ground', 'air', 'cloud', 'snow', 'morning', 'food',
    'wine', 'car', 'game', 'floor', 'wall', 'bed', 'room', 'town', 'place',
    'side', 'way', 'end', 'start', 'wrong', 'right', 'fine', 'cool', 'warm',
    'miss', 'save', 'show', 'pray', 'sorry', 'please', 'thank', 'honey',
    'blue', 'red', 'black', 'white', 'green', 'gold',
  ],
  A2: [
    'always', 'never', 'sometimes', 'often', 'again', 'still', 'already', 'together',
    'away', 'around', 'over', 'under', 'through', 'without', 'inside', 'outside',
    'become', 'believe', 'remember', 'forget', 'change', 'hope', 'wish', 'dream',
    'promise', 'wait', 'follow', 'turn', 'move', 'run', 'walk', 'fall', 'break',
    'hold', 'keep', 'lose', 'win', 'meet', 'talk', 'speak', 'listen', 'hear',
    'beautiful', 'wonderful', 'lonely', 'afraid', 'sure', 'real', 'true', 'free',
    'strong', 'weak', 'young', 'dark', 'bright', 'deep', 'high', 'low', 'far', 'close',
    'reason', 'chance', 'moment', 'story', 'reason', 'future', 'past', 'memory',
    'tear', 'smile', 'kiss', 'touch', 'voice', 'word', 'truth', 'lie', 'pain', 'soul',
    'street', 'door', 'window', 'light', 'shadow', 'star', 'rain', 'wind', 'storm',
  ],
  B1: [
    'although', 'however', 'therefore', 'despite', 'unless', 'whatever', 'whenever',
    'realize', 'imagine', 'consider', 'admit', 'refuse', 'deserve', 'suppose',
    'destroy', 'protect', 'survive', 'escape', 'pretend', 'confess', 'reveal',
    'desire', 'passion', 'emotion', 'silence', 'freedom', 'courage', 'wisdom',
    'stranger', 'enemy', 'hero', 'ghost', 'angel', 'demon', 'poison', 'treasure',
    'endless', 'hopeless', 'restless', 'gentle', 'cruel', 'wild', 'insane', 'perfect',
    'forever', 'nowhere', 'somehow', 'anymore', 'beyond', 'within', 'meanwhile',
    'flame', 'flood', 'thunder', 'horizon', 'ocean', 'desert', 'mountain', 'river',
  ],
  B2: [
    'nevertheless', 'furthermore', 'accordingly', 'ultimately', 'presumably',
    'overwhelm', 'surrender', 'abandon', 'betray', 'redeem', 'devote', 'embrace',
    'shatter', 'linger', 'collapse', 'unravel', 'crave', 'yearn', 'haunt', 'drown',
    'fragile', 'reckless', 'ruthless', 'flawless', 'notorious', 'infinite', 'divine',
    'sorrow', 'agony', 'ecstasy', 'oblivion', 'illusion', 'delusion', 'redemption',
    'chaos', 'venom', 'ashes', 'ember', 'abyss', 'eclipse', 'mirage', 'requiem',
  ],
  C1: [
    'notwithstanding', 'inasmuch', 'henceforth', 'albeit', 'whereby', 'heretofore',
    'transcend', 'succumb', 'relinquish', 'reconcile', 'disillusion', 'personify',
    'ephemeral', 'melancholy', 'insatiable', 'irrevocable', 'clandestine', 'sublime',
    'labyrinth', 'paradox', 'catharsis', 'euphoria', 'nostalgia', 'serenity',
    'juxtapose', 'dichotomy', 'paradigm', 'nuance', 'facade', 'vestige',
  ],
  C2: [
    'quintessential', 'ineffable', 'perfunctory', 'obfuscate', 'perspicacious',
    'grandiloquent', 'sesquipedalian', 'antediluvian', 'defenestration', 'susurrus',
    'verisimilitude', 'ephemerality', 'immutable', 'inexorable', 'pernicious',
    'idiosyncratic', 'cacophony', 'ephemera', 'panacea', 'zeitgeist',
  ],
};

/** Flattened lemma -> level lookup, built once at module load. */
const LEXICON: ReadonlyMap<string, CefrLevel> = (() => {
  const map = new Map<string, CefrLevel>();
  for (const level of CEFR_LEVELS) {
    for (const word of WORDS_BY_LEVEL[level]) {
      // First assignment wins, so a word listed at two levels keeps the easier.
      if (!map.has(word)) map.set(word, level);
    }
  }
  return map;
})();

export function lookupCefrLevel(lemma: string): CefrLevel | null {
  return LEXICON.get(lemma) ?? null;
}

export function lexiconSize(): number {
  return LEXICON.size;
}
