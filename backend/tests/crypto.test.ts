import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, sign, verifySignature } from '../src/lib/crypto.js';

describe('token encryption', () => {
  it('round-trips a token', () => {
    const token = 'BQD-fake-spotify-access-token-0123456789';
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-input');
    const b = encryptSecret('same-input');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('never leaks the plaintext into the stored payload', () => {
    const secret = 'super-secret-refresh-token';
    expect(encryptSecret(secret)).not.toContain(secret);
  });

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    const payload = encryptSecret('original');
    const parts = payload.split('.');
    // Flip the FIRST character of the ciphertext segment, not the last: this
    // payload's ciphertext is 8 bytes, which base64url-encodes to 11 chars
    // whose final char carries only 2 significant bits. Flipping that one
    // landed in the unused padding bits ~7% of the time, leaving the bytes
    // identical and the test intermittently red.
    const data = parts[3] as string;
    parts[3] = (data.startsWith('A') ? 'B' : 'A') + data.slice(1);

    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => decryptSecret('nonsense')).toThrow('Malformed encrypted payload');
    expect(() => decryptSecret('v2.a.b.c')).toThrow('Malformed encrypted payload');
  });
});

describe('signatures', () => {
  it('verifies its own signature', () => {
    expect(verifySignature('payload', sign('payload'))).toBe(true);
  });

  it('rejects a wrong or truncated signature', () => {
    expect(verifySignature('payload', sign('other'))).toBe(false);
    expect(verifySignature('payload', 'short')).toBe(false);
  });
});
