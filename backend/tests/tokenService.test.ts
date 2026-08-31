import { describe, expect, it } from 'vitest';
import { expiryFromNow, isExpired } from '../src/services/tokenService.js';

describe('token expiry', () => {
  const now = 1_700_000_000_000;

  it('converts Spotify expires_in seconds to an absolute Date', () => {
    expect(expiryFromNow(3600, now).getTime()).toBe(now + 3_600_000);
  });

  it('treats a comfortably future expiry as valid', () => {
    expect(isExpired(new Date(now + 10 * 60 * 1000), now)).toBe(false);
  });

  it('treats an already-passed expiry as expired', () => {
    expect(isExpired(new Date(now - 1), now)).toBe(true);
  });

  it('refreshes early, within the 60s skew window', () => {
    // Still technically valid for 30s, but too close to risk an in-flight 401.
    expect(isExpired(new Date(now + 30_000), now)).toBe(true);
    expect(isExpired(new Date(now + 61_000), now)).toBe(false);
  });
});
