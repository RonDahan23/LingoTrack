import { describe, expect, it } from 'vitest';
import { translationError } from './translationError';

class FakeApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

describe('translationError', () => {
  it('reports an offline client distinctly from a failing service', () => {
    expect(translationError(new FakeApiError(0, 'Could not reach the server'))).toBe(
      'No connection — check your network',
    );
  });

  it('turns an upstream provider failure into a retry hint', () => {
    // The backend answers 502 with the full provider-by-provider reason; the
    // learner gets the actionable summary, not the diagnostic string.
    const err = new FakeApiError(502, 'All translation providers failed (mymemory quota)');
    expect(translationError(err)).toBe('Translation service is busy — try again in a moment');
  });

  it('passes a specific server message through', () => {
    expect(translationError(new FakeApiError(400, 'text query parameter is required'))).toBe(
      'text query parameter is required',
    );
  });

  it('falls back for a non-Error throw', () => {
    expect(translationError('boom')).toBe('Translation failed');
    expect(translationError(new Error('   '))).toBe('Translation failed');
  });
});
