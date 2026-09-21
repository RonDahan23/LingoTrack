import { describe, expect, it } from 'vitest';

import { pickEnglishVoice, type VoiceLike } from './speech';

const voice = (lang: string, name: string, localService = true): VoiceLike => ({
  lang,
  name,
  localService,
});

describe('pickEnglishVoice', () => {
  it('prefers en-US over other English locales', () => {
    const voices = [voice('en-GB', 'Daniel'), voice('en-US', 'Samantha'), voice('en-AU', 'Karen')];
    expect(pickEnglishVoice(voices)?.name).toBe('Samantha');
  });

  it('accepts an underscore locale tag', () => {
    expect(pickEnglishVoice([voice('en_US', 'Zira')])?.name).toBe('Zira');
  });

  it('falls back to another English locale when en-US is absent', () => {
    expect(pickEnglishVoice([voice('he-IL', 'Carmit'), voice('en-GB', 'Daniel')])?.name).toBe(
      'Daniel',
    );
  });

  it('prefers a local voice over a remote one of the same locale', () => {
    // A remote voice adds latency per tap and stops working offline.
    const voices = [voice('en-US', 'Remote', false), voice('en-US', 'Local', true)];
    expect(pickEnglishVoice(voices)?.name).toBe('Local');
  });

  it('never returns a non-English voice', () => {
    // Hebrew is the UI language here, so a loose match would read English
    // words with a Hebrew voice.
    expect(pickEnglishVoice([voice('he-IL', 'Carmit'), voice('eng-x', 'Bogus')])).toBeNull();
  });

  it('returns null when there are no voices at all', () => {
    // Platforms load voices asynchronously; the caller falls back to lang.
    expect(pickEnglishVoice([])).toBeNull();
  });
});
