import { describe, expect, it } from 'vitest';
import {
  buildAuthorizeUrl,
  createOAuthState,
  verifyOAuthState,
  SPOTIFY_SCOPES,
} from '../src/services/spotify/oauth.js';
import { issueSessionToken, verifySessionToken } from '../src/services/sessionService.js';

describe('OAuth state', () => {
  it('accepts a freshly issued state', () => {
    expect(verifyOAuthState(createOAuthState())).toBe(true);
  });

  it('rejects a forged state', () => {
    const state = createOAuthState();
    const [nonce, ts] = state.split('.');
    expect(verifyOAuthState(`${nonce}.${ts}.forgedsignature`)).toBe(false);
  });

  it('rejects a state whose timestamp was tampered with', () => {
    const [nonce, , sig] = createOAuthState().split('.');
    expect(verifyOAuthState(`${nonce}.${Date.now() + 5_000}.${sig}`)).toBe(false);
  });

  it('expires after 10 minutes', () => {
    const issuedAt = Date.now();
    const state = createOAuthState(issuedAt);
    expect(verifyOAuthState(state, issuedAt + 9 * 60 * 1000)).toBe(true);
    expect(verifyOAuthState(state, issuedAt + 11 * 60 * 1000)).toBe(false);
  });

  it('rejects garbage', () => {
    expect(verifyOAuthState('')).toBe(false);
    expect(verifyOAuthState('a.b')).toBe(false);
  });
});

describe('buildAuthorizeUrl', () => {
  it('requests the scopes the app depends on', () => {
    const url = new URL(buildAuthorizeUrl(createOAuthState()));
    const scopes = (url.searchParams.get('scope') ?? '').split(' ');

    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    for (const scope of SPOTIFY_SCOPES) {
      expect(scopes).toContain(scope);
    }
  });
});

describe('session tokens', () => {
  it('round-trips a user id', () => {
    expect(verifySessionToken(issueSessionToken('user-123'))).toBe('user-123');
  });

  it('rejects an expired token', () => {
    const now = Date.now();
    const token = issueSessionToken('user-123', now);
    // Default TTL is 720h; step well past it.
    expect(verifySessionToken(token, now + 721 * 60 * 60 * 1000)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const forgedPayload = Buffer.from(
      JSON.stringify({ uid: 'attacker', exp: Date.now() + 100_000 }),
    ).toString('base64url');
    const [, realSignature] = issueSessionToken('victim').split('.');

    expect(verifySessionToken(`${forgedPayload}.${realSignature}`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('only-one-part')).toBeNull();
  });
});
