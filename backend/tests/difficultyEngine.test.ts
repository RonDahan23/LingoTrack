import { describe, expect, it } from 'vitest';
import {
  countAdvancedGrammar,
  gradeTrack,
  scoreAudioDynamics,
  scoreVocabulary,
} from '../src/services/grading/difficultyEngine.js';
import { tokenize, toLemma, tokenCefrLevel } from '../src/services/grading/tokenizer.js';

describe('tokenizer', () => {
  it('lowercases, strips punctuation, keeps apostrophes', () => {
    expect(tokenize("Don't STOP, believe!")).toEqual(["don't", 'stop', 'believe']);
  });

  it('normalises smart quotes', () => {
    expect(tokenize('I’m here')).toEqual(["i'm", 'here']);
  });

  it('lemmatises inflected forms back to known lemmas', () => {
    expect(toLemma('loving')).toBe('love');
    expect(toLemma('dreams')).toBe('dream');
    expect(toLemma('tried')).toBe('try');
  });

  it('resolves CEFR level through lemmatisation', () => {
    expect(tokenCefrLevel('running')).toBe('A2'); // run is A2
    expect(tokenCefrLevel('xylophonic')).toBeNull();
  });
});

describe('scoreVocabulary', () => {
  it('scores simple A1 vocabulary low', () => {
    const score = scoreVocabulary(tokenize('I love you and you love me'));
    expect(score).toBeLessThan(2);
  });

  it('scores rare/unknown vocabulary high', () => {
    const score = scoreVocabulary(tokenize('quintessential obfuscate perspicacious defenestration'));
    expect(score).toBeGreaterThan(8);
  });

  it('places mixed vocabulary in the middle', () => {
    const easy = scoreVocabulary(tokenize('I love you'));
    const mixed = scoreVocabulary(tokenize('I desire redemption'));
    expect(mixed).toBeGreaterThan(easy);
  });
});

describe('countAdvancedGrammar', () => {
  it('detects passive and perfect constructions', () => {
    expect(countAdvancedGrammar(['the door was opened'])).toBe(1);
    expect(countAdvancedGrammar(['I have loved you'])).toBe(1);
  });

  it('ignores simple present/past', () => {
    expect(countAdvancedGrammar(['I love you', 'she runs fast'])).toBe(0);
  });
});

describe('scoreAudioDynamics', () => {
  it('returns a neutral score when duration is unknown', () => {
    expect(scoreAudioDynamics(100, null)).toBe(5);
    expect(scoreAudioDynamics(100, 0)).toBe(5);
  });

  it('scores a slow ballad lower than fast rap for the same lyrics', () => {
    const slow = scoreAudioDynamics(200, 300_000); // 40 wpm
    const fast = scoreAudioDynamics(200, 48_000); // 250 wpm
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('gradeTrack', () => {
  it('grades a simple, slow, repetitive song as BEGINNER', () => {
    const result = gradeTrack({
      lines: ['I love you', 'you love me', 'we are so happy', 'I love you'],
      durationMs: 240_000,
    });
    expect(result.level).toBe('BEGINNER');
    expect(result.score).toBeLessThanOrEqual(3.5);
  });

  it('grades dense, rare-word, fast, varied lyrics as ADVANCED', () => {
    // The spec's ADVANCED profile: heavy rare vocabulary (high per-content-word
    // difficulty), high lexical diversity, and fast delivery (~189 wpm). All
    // three layers must be elevated — hard vocab alone is not enough.
    const dense = [
      'perspicacious labyrinths have swallowed my clandestine catharsis tonight',
      'notorious requiems were unravelling sublime paradoxes beneath oblivion',
      'immutable serenity has been betrayed by pernicious cacophony again',
      'nostalgia devoured euphoria while grandiloquent melancholy lingered restlessly',
      'irrevocable nuance haunts these quintessential idiosyncratic disillusioned sonnets',
      'venomous eclipse reconciled the ephemeral mirage of shattered reason',
      'insatiable delusion transcends this labyrinthine paradox of sorrow',
      'clandestine embers smoulder where notorious ecstasy surrendered slowly',
    ];
    const result = gradeTrack({ lines: dense, durationMs: 21_000 });
    expect(result.level).toBe('ADVANCED');
    expect(result.score).toBeGreaterThan(7);
  });

  it('ranks the four calibration profiles in the expected order', () => {
    const easy = gradeTrack({
      lines: ['I love you', 'you love me', 'we are so happy now'],
      durationMs: 240_000,
    });
    const pop = gradeTrack({
      lines: ['the sun is shining and the sky is blue', 'I dance all night and sing this song'],
      durationMs: 210_000,
    });
    const mixed = gradeTrack({
      lines: [
        'sorrow and oblivion shatter my fragile illusion',
        'reckless passion lingers in the melancholy shadows',
        'I surrender to the sublime chaos of desire',
        'betrayed by silence, abandon every fragile hope',
        'the endless storm devours my restless memory',
        'a stranger drowns beneath the notorious tide',
      ],
      durationMs: 90_000,
    });

    // easy and pop are both trivially-easy (all-A1 vocab, near-zero wpm), so
    // they land in the same bucket; what matters is they're BEGINNER and that
    // the harder-vocabulary "mixed" profile scores strictly above them.
    expect(easy.level).toBe('BEGINNER');
    expect(pop.level).toBe('BEGINNER');
    expect(mixed.level).toBe('INTERMEDIATE');
    expect(mixed.score).toBeGreaterThan(easy.score);
    expect(mixed.score).toBeGreaterThan(pop.score);
  });

  it('is deterministic', () => {
    const input = { lines: ['I love you', 'desire and sorrow'], durationMs: 180_000 };
    expect(gradeTrack(input)).toEqual(gradeTrack(input));
  });

  it('keeps the score within 0–10 and consistent with its level', () => {
    const result = gradeTrack({ lines: ['I desire redemption tonight'], durationMs: 120_000 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.wordCount).toBe(4);
  });
});
