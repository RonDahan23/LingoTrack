import { env } from '../config/env.js';
import { sign, verifySignature } from '../lib/crypto.js';

/**
 * Minimal stateless session token: base64url(JSON payload).HMAC.
 *
 * The Spotify tokens never leave the server — the mobile client holds only
 * this, and the backend swaps it for a Spotify call when needed. Deliberately
 * not a full JWT: no algorithm negotiation means no alg-confusion class of bug.
 */

interface SessionPayload {
  uid: string;
  exp: number; // epoch ms
}

export function issueSessionToken(userId: string, nowMs: number = Date.now()): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: nowMs + env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

/** Returns the user id, or null if the token is malformed, forged, or expired. */
export function verifySessionToken(token: string, nowMs: number = Date.now()): string | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  if (!verifySignature(encoded, signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;

    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= nowMs) return null;

    return payload.uid;
  } catch {
    return null;
  }
}
