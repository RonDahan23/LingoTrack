/**
 * Common English base forms, used ONLY to validate morphological analysis.
 *
 * Why this is separate from src/config/cefr.ts: that lexicon feeds the
 * difficulty engine, where every added word changes a track's vocabulary score
 * (an unknown word grades near-C2, a listed one grades at its level). Expanding
 * it to help the lemmatizer would silently re-grade the whole library. This set
 * carries no difficulty weight — it only answers "is this a real base form?",
 * so the lemmatizer can tell "climber" -> "climb" from "water" -> "water".
 *
 * Irregular verb bases are already covered by irregulars.ts and are not
 * repeated here. Skewed toward the vocabulary that actually appears in song
 * lyrics.
 */

export const COMMON_STEMS: ReadonlySet<string> = new Set([
  // Motion / physical action
  'climb', 'stop', 'walk', 'talk', 'jump', 'reach', 'pull', 'push', 'turn',
  'move', 'roll', 'slip', 'crawl', 'march', 'rush', 'chase', 'follow', 'carry',
  'lift', 'drop', 'throw', 'kick', 'point', 'wave', 'dance', 'spin', 'travel',
  'return', 'enter', 'escape', 'arrive', 'leave', 'pass', 'cross', 'wander',
  // Expression / sound
  'laugh', 'smile', 'cry', 'scream', 'shout', 'whisper', 'call', 'speak',
  'listen', 'watch', 'look', 'stare', 'glance', 'answer', 'ask', 'reply',
  'shine', 'glow', 'burn', 'flash', 'sound', 'echo', 'ring', 'knock',
  // Emotion / cognition
  'love', 'hate', 'fear', 'hope', 'wish', 'dream', 'want', 'need', 'care',
  'believe', 'trust', 'doubt', 'worry', 'wonder', 'remember', 'forget',
  'imagine', 'realise', 'realize', 'decide', 'choose', 'accept', 'refuse',
  'regret', 'blame', 'forgive', 'promise', 'pretend', 'admit', 'confess',
  'miss', 'enjoy', 'prefer', 'expect', 'suppose', 'guess', 'consider',
  // Being / having / states
  'stay', 'wait', 'rest', 'sleep', 'wake', 'live', 'die', 'grow', 'change',
  'become', 'remain', 'belong', 'exist', 'happen', 'seem', 'appear',
  'disappear', 'continue', 'begin', 'start', 'finish', 'end', 'last',
  // Work / creation
  'work', 'build', 'create', 'make', 'break', 'fix', 'repair', 'destroy',
  'paint', 'draw', 'write', 'read', 'study', 'teach', 'learn', 'train',
  'practice', 'play', 'sing', 'perform', 'record', 'produce', 'design',
  'help', 'serve', 'save', 'protect', 'defend', 'attack', 'fight', 'win',
  'lose', 'earn', 'spend', 'buy', 'sell', 'pay', 'cost', 'own', 'share',
  'give', 'take', 'send', 'receive', 'bring', 'offer', 'provide', 'collect',
  // Common nouns
  'song', 'music', 'voice', 'word', 'story', 'night', 'day', 'morning',
  'light', 'dark', 'star', 'moon', 'sun', 'sky', 'cloud', 'rain', 'storm',
  'fire', 'water', 'earth', 'wind', 'sea', 'ocean', 'river', 'mountain',
  'road', 'street', 'city', 'town', 'house', 'home', 'room', 'door', 'window',
  'heart', 'soul', 'mind', 'body', 'hand', 'eye', 'face', 'head', 'blood',
  'bone', 'skin', 'tear', 'smile', 'kiss', 'touch', 'friend', 'enemy',
  'father', 'mother', 'brother', 'sister', 'child', 'people', 'world', 'life',
  'death', 'time', 'year', 'season', 'summer', 'winter', 'money', 'power',
  'truth', 'lie', 'secret', 'answer', 'question', 'reason', 'chance', 'luck',
  'game', 'name', 'place', 'thing', 'way', 'part', 'side', 'end', 'line',
  'colour', 'color', 'shadow', 'mirror', 'picture', 'letter', 'number',
  // Common adjectives
  'good', 'bad', 'big', 'small', 'long', 'short', 'high', 'low', 'fast',
  'slow', 'hot', 'cold', 'warm', 'cool', 'new', 'old', 'young', 'strong',
  'weak', 'hard', 'soft', 'easy', 'true', 'false', 'real', 'free', 'safe',
  'sure', 'clear', 'clean', 'dirty', 'bright', 'quiet', 'loud', 'deep',
  'wide', 'close', 'far', 'near', 'full', 'empty', 'rich', 'poor', 'happy',
  'sad', 'angry', 'calm', 'kind', 'cruel', 'brave', 'proud', 'quick',
  'simple', 'strange', 'wild', 'sweet', 'bitter', 'heavy', 'light', 'sharp',
  'perfect', 'wrong', 'right', 'beautiful', 'ugly', 'lonely', 'tired',
  'alive', 'dead', 'broken', 'lost', 'blind', 'silent', 'golden', 'endless',
]);

/**
 * Words whose endings only LOOK derivational: "water" is not water+er, "family"
 * is not fami+ly, "witness" is not wit+ness.
 *
 * Kept separate from COMMON_STEMS because it guards a different decision.
 * COMMON_STEMS answers "is this candidate a real word?"; this set answers
 * "should this word be left alone entirely?" — deriveRoot consults it before
 * stripping anything, so a genuinely derived word that happens to be common
 * ("hopeless", "climber") still reduces to its root.
 */
export const NON_DERIVED_WORDS: ReadonlySet<string> = new Set([
  'other', 'another', 'together', 'weather', 'whether', 'rather', 'either',
  'matter', 'better', 'letter', 'winter', 'center', 'centre', 'master',
  'sister', 'brother', 'mother', 'father', 'daughter', 'laughter', 'chapter',
  'after', 'over', 'under', 'ever', 'never', 'river', 'silver', 'summer',
  'corner', 'danger', 'anger', 'order', 'paper', 'super', 'proper', 'water',
  'flower', 'power', 'tower', 'hour', 'colour', 'honour', 'favour', 'labour',
  'neighbour', 'terror', 'error', 'mirror', 'number', 'member', 'remember',
  'answer', 'offer', 'suffer', 'cover', 'discover', 'deliver', 'consider',
  'whisper', 'shoulder', 'wonder', 'thunder', 'shelter', 'weather',
  'family', 'only', 'early', 'ugly', 'holy', 'silly', 'jelly', 'belly',
  'reply', 'supply', 'apply', 'multiply', 'imply', 'rely', 'lovely',
  'friendly', 'likely', 'daily', 'weekly', 'lonely', 'july',
  'address', 'across', 'business', 'witness', 'illness', 'harness', 'process',
  'access', 'success', 'princess', 'express', 'press', 'dress', 'guess',
  'city', 'pity', 'duty', 'beauty', 'party', 'empty', 'plenty', 'twenty',
]);

/** True when the word is a base form we recognise for validation purposes. */
export function isCommonStem(word: string): boolean {
  return COMMON_STEMS.has(word) || NON_DERIVED_WORDS.has(word);
}

/** True when the word must never be reduced by derivational stripping. */
export function isNonDerived(word: string): boolean {
  return NON_DERIVED_WORDS.has(word);
}
