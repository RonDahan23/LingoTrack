import { describe, it, expect } from 'vitest';
import { parseAuthRedirect } from './authRedirect';

describe('parseAuthRedirect', () => {
  it('returns null for a normal load', () => {
    expect(parseAuthRedirect('')).toBeNull();
    expect(parseAuthRedirect('?foo=bar')).toBeNull();
  });

  it('extracts a session token', () => {
    expect(parseAuthRedirect('?token=abc.def.ghi')).toEqual({
      type: 'token',
      token: 'abc.def.ghi',
    });
  });

  it('extracts an error reason', () => {
    expect(parseAuthRedirect('?error=access_denied')).toEqual({
      type: 'error',
      reason: 'access_denied',
    });
  });

  it('prefers a token when both are present', () => {
    expect(parseAuthRedirect('?token=t&error=e')).toEqual({ type: 'token', token: 't' });
  });
});
