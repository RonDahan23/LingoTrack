import { Router } from 'express';
import { env } from '../config/env.js';
import { encryptSecret } from '../lib/crypto.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, requireAuth } from '../middleware/requireAuth.js';
import { getCurrentUserProfile } from '../services/spotify/client.js';
import {
  buildAuthorizeUrl,
  createOAuthState,
  exchangeCodeForTokens,
  verifyOAuthState,
} from '../services/spotify/oauth.js';
import { issueSessionToken } from '../services/sessionService.js';
import { expiryFromNow } from '../services/tokenService.js';
import { startLikedTracksSync } from '../services/syncService.js';

export const authRouter: Router = Router();

/** Builds a redirect back to the SPA carrying a single query param. */
function webAppRedirect(param: 'token' | 'error', value: string): string {
  const redirect = new URL(env.WEB_APP_URL);
  redirect.searchParams.set(param, value);
  return redirect.toString();
}

/**
 * Entry point the SPA sends the browser to (full-page navigation). Redirects on
 * to Spotify's consent page.
 */
authRouter.get('/auth/spotify', (_req, res) => {
  res.redirect(buildAuthorizeUrl(createOAuthState()));
});

/**
 * Spotify redirects the browser here with ?code&state (or ?error on denial).
 * Exchanges the code, upserts the user, mints a session token, kicks off the
 * first library sync, and redirects the browser back to the web app with the
 * token in the URL. Because this is a top-level browser navigation, auth
 * problems are handed back to the SPA as `?error=` rather than raw JSON.
 */
authRouter.get(
  '/auth/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;

    if (typeof error === 'string') {
      return res.redirect(webAppRedirect('error', error));
    }
    if (typeof code !== 'string' || typeof state !== 'string') {
      return res.redirect(webAppRedirect('error', 'missing_code'));
    }
    if (!verifyOAuthState(state)) {
      return res.redirect(webAppRedirect('error', 'invalid_state'));
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return res.redirect(webAppRedirect('error', 'no_refresh_token'));
    }

    const profile = await getCurrentUserProfile(tokens.access_token);
    if (!profile.email) {
      // user-read-email scope was declined.
      return res.redirect(webAppRedirect('error', 'no_email'));
    }

    const encrypted = {
      accessToken: encryptSecret(tokens.access_token),
      refreshToken: encryptSecret(tokens.refresh_token),
      tokenExpiresAt: expiryFromNow(tokens.expires_in),
    };

    const user = await prisma.user.upsert({
      where: { spotifyId: profile.id },
      create: { spotifyId: profile.id, email: profile.email, ...encrypted },
      update: { email: profile.email, ...encrypted },
    });

    startLikedTracksSync(user.id);

    const sessionToken = issueSessionToken(user.id);
    return res.redirect(webAppRedirect('token', sessionToken));
  }),
);

/** Confirms a session token and returns the account it belongs to. */
authRouter.get(
  '/auth/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.userId as string },
      select: { id: true, email: true, spotifyId: true, createdAt: true },
    });

    res.json(user);
  }),
);
