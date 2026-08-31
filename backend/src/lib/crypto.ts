import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Spotify access/refresh tokens are stored encrypted in `User.accessToken` /
 * `User.refreshToken`. Nothing outside this module should read those columns
 * directly — see src/services/tokenService.ts for the accessor.
 *
 * Format: v1.<iv>.<authTag>.<ciphertext>, each part base64url.
 * AES-256-GCM is authenticated, so a tampered ciphertext fails to decrypt
 * rather than yielding garbage.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM-recommended size
const VERSION = 'v1';

const encryptionKey = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split('.');

  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error('Malformed encrypted payload');
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey,
    Buffer.from(ivPart, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Base64url HMAC-SHA256, used for signing OAuth state and session tokens. */
export function sign(value: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(value).digest('base64url');
}

/** Constant-time signature comparison. */
export function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);

  // timingSafeEqual throws on length mismatch, so guard first. The length of a
  // signature is not secret.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
