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
    // Flip the last character of the ciphertext segment.
    const data = parts[3] as string;
    parts[3] = (data.slice(0, -1) + (data.endsWith('A') ? 'B' : 'A'));

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
