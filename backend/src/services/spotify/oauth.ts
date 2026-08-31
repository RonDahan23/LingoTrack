import { randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { sign, verifySignature } from '../../lib/crypto.js';

/**
 * Spotify Authorization Code flow.
 *
 * `user-read-email` → User.email; `user-library-read` → /v1/me/tracks ingestion;
 * `streaming` + the playback scopes → the Web Playback SDK full-song player
 * (`streaming` and `user-modify-playback-state` require Spotify Premium at play
 * time). Changing this list means existing users must re-authenticate to grant
 * the new scopes.
 */
export const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-library-read',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
] as const;

const ACCOUNTS_BASE = 'https://accounts.spotify.com';
const STATE_TTL_MS = 10 * 60 * 1000;

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Stateless CSRF state: a nonce plus issue time, HMAC-signed. Avoids
 * server-side session storage; the signature makes it unforgeable and the
 * timestamp bounds replay to STATE_TTL_MS.
 */
export function createOAuthState(issuedAtMs: number = Date.now()): string {
  const payload = `${randomBytes(16).toString('base64url')}.${issuedAtMs}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthState(state: string, nowMs: number = Date.now()): boolean {
  const [nonce, issuedAt, signature] = state.split('.');
  if (!nonce || !issuedAt || !signature) return false;
  if (!verifySignature(`${nonce}.${issuedAt}`, signature)) return false;

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;

  const age = nowMs - issuedAtMs;
  return age >= 0 && age <= STATE_TTL_MS;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES.join(' '),
    state,
  });

  return `${ACCOUNTS_BASE}/authorize?${params.toString()}`;
}

function basicAuthHeader(): string {
  const credentials = `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

async function requestToken(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  const response = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Spotify token request failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export function exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
    }),
  );
}

export function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  );
}
