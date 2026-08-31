import type { User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { refreshAccessToken, type SpotifyTokenResponse } from './spotify/oauth.js';

/**
 * The only sanctioned way to obtain a usable Spotify access token.
 * Decrypts at rest, refreshes when near expiry, re-encrypts, persists.
 */

/** Refresh this long before actual expiry so in-flight requests don't 401. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * De-dupes concurrent refreshes for the same user. Without this, a sync worker
 * paginating liked tracks alongside an API request can fire two refreshes at
 * once; Spotify may rotate the refresh token, and the slower writer would
 * persist a token that has already been invalidated.
 */
const inFlightRefreshes = new Map<string, Promise<string>>();

export function persistTokens(
  userId: string,
  tokens: Pick<SpotifyTokenResponse, 'access_token' | 'expires_in'> & { refresh_token?: string },
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: encryptSecret(tokens.access_token),
      tokenExpiresAt: expiryFromNow(tokens.expires_in),
      // Spotify omits refresh_token on most refreshes — keep the stored one.
      ...(tokens.refresh_token ? { refreshToken: encryptSecret(tokens.refresh_token) } : {}),
    },
  });
}

export function expiryFromNow(expiresInSeconds: number, nowMs: number = Date.now()): Date {
  return new Date(nowMs + expiresInSeconds * 1000);
}

export function isExpired(expiresAt: Date, nowMs: number = Date.now()): boolean {
  return expiresAt.getTime() - EXPIRY_SKEW_MS <= nowMs;
}

/** Returns a decrypted, non-expired access token, refreshing if necessary. */
export async function getValidAccessToken(user: Pick<User, 'id' | 'accessToken' | 'tokenExpiresAt'>): Promise<string> {
  if (!isExpired(user.tokenExpiresAt)) {
    return decryptSecret(user.accessToken);
  }

  const existing = inFlightRefreshes.get(user.id);
  if (existing) return existing;

  const refresh = doRefresh(user.id).finally(() => {
    inFlightRefreshes.delete(user.id);
  });

  inFlightRefreshes.set(user.id, refresh);
  return refresh;
}

async function doRefresh(userId: string): Promise<string> {
  // Re-read rather than trusting the caller's copy: another request may have
  // already refreshed while this one waited.
  const current = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!isExpired(current.tokenExpiresAt)) {
    return decryptSecret(current.accessToken);
  }

  const tokens = await refreshAccessToken(decryptSecret(current.refreshToken));
  await persistTokens(userId, tokens);

  return tokens.access_token;
}
