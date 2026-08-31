import { describe, expect, it } from 'vitest';

import {
  adjectiveForms,
  agentNoun,
  comparative,
  gerund,
  nounForms,
  pastTense,
  pluralize,
  thirdPerson,
  toAdverb,
  verbForms,
} from '../src/services/morphology/inflect.js';
import { deriveRoot, lemmatize } from '../src/services/morphology/lemma.js';
import { guessPartOfSpeech } from '../src/services/morphology/pos.js';
import { enrichWord, familyTokens } from '../src/services/morphology/enrich.js';

describe('inflect: verb forms', () => {
  it('conjugates a regular verb', () => {
    expect(thirdPerson('climb')).toBe('climbs');
    expect(gerund('climb')).toBe('climbing');
    expect(pastTense('climb')).toBe('climbed');
    expect(agentNoun('climb')).toBe('climber');
  });

  it('drops a silent -e before -ing', () => {
    expect(gerund('make')).toBe('making');
    expect(gerund('hope')).toBe('hoping');
    expect(pastTense('hope')).toBe('hoped');
  });

  it('keeps -ee and -ye intact', () => {
    expect(gerund('see')).toBe('seeing');
    expect(gerund('agree')).toBe('agreeing');
  });

  it('turns -ie into -ying', () => {
    expect(gerund('die')).toBe('dying');
    expect(gerund('lie')).toBe('lying');
  });

  it('doubles the final consonant on short CVC verbs', () => {
    expect(gerund('run')).toBe('running');
    expect(gerund('stop')).toBe('stopping');
    expect(pastTense('stop')).toBe('stopped');
  });

  it('does not double after two vowels or w/x/y', () => {
    expect(gerund('play')).toBe('playing');
    expect(pastTense('play')).toBe('played');
    expect(gerund('read')).toBe('reading');
  });

  it('doubles stressed two-syllable verbs from the curated list', () => {
    expect(gerund('begin')).toBe('beginning');
    expect(pastTense('prefer')).toBe('preferred');
  });

  it('does not double unstressed two-syllable verbs', () => {
    expect(gerund('open')).toBe('opening');
    expect(pastTense('visit')).toBe('visited');
  });

  it('handles consonant+y', () => {
    expect(thirdPerson('carry')).toBe('carries');
    expect(pastTense('carry')).toBe('carried');
    expect(gerund('carry')).toBe('carrying');
  });

  it('adds -es after a sibilant', () => {
    expect(thirdPerson('watch')).toBe('watches');
    expect(thirdPerson('miss')).toBe('misses');
    expect(thirdPerson('go')).toBe('goes');
  });

  it('uses irregular tables', () => {
    expect(pastTense('go')).toBe('went');
    expect(pastTense('sing')).toBe('sang');
    expect(thirdPerson('have')).toBe('has');
    expect(gerund('be')).toBe('being');
  });

  it('builds a labelled family with the infinitive', () => {
    const forms = verbForms('climb');
    const byLabel = Object.fromEntries(forms.map((f) => [f.label, f.form]));
    expect(byLabel.base).toBe('climb');
    expect(byLabel.infinitive).toBe('to climb');
    expect(byLabel.gerund).toBe('climbing');
    expect(byLabel.past).toBe('climbed');
    expect(byLabel.agent_noun).toBe('climber');
  });

  it('separates past from past participle only when they differ', () => {
    const sing = verbForms('sing').map((f) => f.form);
    expect(sing).toContain('sang');
    expect(sing).toContain('sung');
    const climb = verbForms('climb').filter((f) => f.label === 'past_participle');
    expect(climb).toHaveLength(0);
  });

  it('omits an agent noun for very short auxiliaries', () => {
    expect(verbForms('be').some((f) => f.label === 'agent_noun')).toBe(false);
  });
});

describe('inflect: nouns and adjectives', () => {
  it('pluralises regularly', () => {
    expect(pluralize('song')).toBe('songs');
    expect(pluralize('box')).toBe('boxes');
    expect(pluralize('city')).toBe('cities');
  });

  it('uses irregular plurals', () => {
    expect(pluralize('child')).toBe('children');
    expect(pluralize('life')).toBe('lives');
    expect(pluralize('sheep')).toBe('sheep');
  });

  it('omits a plural for uncountable nouns', () => {
    const forms = nounForms('music').map((f) => f.label);
    expect(forms).toEqual(['singular']);
  });

  it('grades adjectives', () => {
    expect(comparative('big')).toBe('bigger');
    expect(comparative('happy')).toBe('happier');
    expect(comparative('good')).toBe('better');
  });

  it('uses the periphrastic comparative for long adjectives', () => {
    expect(comparative('beautiful')).toBe('more beautiful');
  });

  it('derives adverbs', () => {
    expect(toAdverb('quick')).toBe('quickly');
    expect(toAdverb('happy')).toBe('happily');
    expect(toAdverb('simple')).toBe('simply');
    expect(toAdverb('basic')).toBe('basically');
    expect(toAdverb('good')).toBe('well');
  });

  it('builds an adjective family', () => {
    const forms = adjectiveForms('happy').map((f) => f.form);
    expect(forms).toContain('happier');
    expect(forms).toContain('happiest');
    expect(forms).toContain('happily');
  });
});

describe('lemmatize', () => {
  it('reduces regular inflections', () => {
    expect(lemmatize('climbing', 'VERB')).toBe('climb');
    expect(lemmatize('climbed', 'VERB')).toBe('climb');
    expect(lemmatize('climbs', 'VERB')).toBe('climb');
  });

  it('restores a dropped -e', () => {
    expect(lemmatize('making', 'VERB')).toBe('make');
    expect(lemmatize('hoped', 'VERB')).toBe('hope');
  });

  it('undoubles consonants', () => {
    expect(lemmatize('running', 'VERB')).toBe('run');
    expect(lemmatize('stopped', 'VERB')).toBe('stop');
  });

  it('handles irregular forms', () => {
    expect(lemmatize('went', 'VERB')).toBe('go');
    expect(lemmatize('sang', 'VERB')).toBe('sing');
    expect(lemmatize('children', 'NOUN')).toBe('child');
    expect(lemmatize('better', 'ADJECTIVE')).toBe('good');
  });

  it('singularises nouns', () => {
    expect(lemmatize('songs', 'NOUN')).toBe('song');
    expect(lemmatize('cities', 'NOUN')).toBe('city');
    expect(lemmatize('boxes', 'NOUN')).toBe('box');
    expect(lemmatize('lives', 'NOUN')).toBe('life');
  });

  it('does not strip a final -ss', () => {
    expect(lemmatize('grass', 'NOUN')).toBe('grass');
  });

  it('reduces adverbs and comparatives', () => {
    expect(lemmatize('happily', 'ADVERB')).toBe('happy');
    expect(lemmatize('quickly', 'ADVERB')).toBe('quick');
    expect(lemmatize('bigger', 'ADJECTIVE')).toBe('big');
  });

  it('infers a rule when the part of speech is unknown', () => {
    expect(lemmatize('climbing')).toBe('climb');
    expect(lemmatize('songs')).toBe('song');
  });

  it('leaves a base form untouched', () => {
    expect(lemmatize('climb', 'VERB')).toBe('climb');
    expect(lemmatize('song', 'NOUN')).toBe('song');
  });
});

describe('deriveRoot', () => {
  it('strips derivational suffixes to a known root', () => {
    expect(deriveRoot('climber')).toBe('climb');
    expect(deriveRoot('happiness')).toBe('happy');
    expect(deriveRoot('hopeless')).toBe('hope');
  });

  it('does not mangle a word whose ending only looks derivational', () => {
    expect(deriveRoot('water')).toBe('water');
    expect(deriveRoot('other')).toBe('other');
  });

  it('returns short words unchanged', () => {
    expect(deriveRoot('run')).toBe('run');
  });
});

describe('guessPartOfSpeech', () => {
  it('reads the infinitive marker from context', () => {
    expect(guessPartOfSpeech('climb', 'I want to climb the wall').pos).toBe('VERB');
  });

  it('reads a determiner from context', () => {
    expect(guessPartOfSpeech('climb', 'the climb was long').pos).toBe('NOUN');
  });

  it('reads a progressive auxiliary', () => {
    expect(guessPartOfSpeech('climbing', 'I am climbing higher').pos).toBe('VERB');
  });

  it('falls back to suffix shape without context', () => {
    expect(guessPartOfSpeech('happiness').pos).toBe('NOUN');
    expect(guessPartOfSpeech('quickly').pos).toBe('ADVERB');
    expect(guessPartOfSpeech('beautiful').pos).toBe('ADJECTIVE');
  });

  it('does not treat -ly exceptions as adverbs', () => {
    expect(guessPartOfSpeech('family').pos).not.toBe('ADVERB');
  });

  it('recognises known irregular verbs', () => {
    expect(guessPartOfSpeech('went').pos).toBe('VERB');
  });

  it('returns UNKNOWN rather than guessing wildly', () => {
    expect(guessPartOfSpeech('zqx').pos).toBe('UNKNOWN');
  });
});

describe('enrichWord', () => {
  it('enriches the motivating example end to end', () => {
    const result = enrichWord('climbing', 'I keep climbing higher');
    expect(result).not.toBeNull();
    const forms = result!.forms.map((f) => f.form);

    expect(result!.surface).toBe('climbing');
    expect(result!.lemma).toBe('climb');
    expect(result!.root).toBe('climb');
    expect(result!.partOfSpeech).toBe('VERB');
    expect(forms).toEqual(expect.arrayContaining(['climb', 'to climb', 'climbing', 'climbed']));
  });

  it('normalises punctuation and case', () => {
    const result = enrichWord('Climbing,');
    expect(result?.surface).toBe('climbing');
  });

  it('returns null for input with no word token', () => {
    expect(enrichWord('...')).toBeNull();
    expect(enrichWord('')).toBeNull();
  });

  it('produces a noun family for a determiner context', () => {
    const result = enrichWord('song', 'this song saved me');
    expect(result?.partOfSpeech).toBe('NOUN');
    expect(result?.forms.map((f) => f.form)).toContain('songs');
  });

  it('exposes single-token family members only', () => {
    const result = enrichWord('climbing', 'I keep climbing higher');
    const tokens = familyTokens(result!);
    expect(tokens).toContain('climb');
    expect(tokens.every((t) => !t.includes(' '))).toBe(true);
  });
});
