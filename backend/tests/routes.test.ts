import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { issueSessionToken } from '../src/services/sessionService.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe('auth guard', () => {
  it.each([
    '/api/sync/status',
    '/api/auth/me',
    '/api/words',
    '/api/words/stats',
    '/api/practice/session',
  ])('rejects %s without a token', async (path) => {
    const res = await fetch(`${baseUrl}${path}`);
    expect(res.status).toBe(401);
  });

  it.each(['/api/words', '/api/practice/submit'])(
    'rejects POST %s without a token',
    async (path) => {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    },
  );

  it('rejects a forged bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/sync/status`, {
      headers: { Authorization: 'Bearer abc.def' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an expired session token', async () => {
    const stale = issueSessionToken('user-1', Date.now() - 1000 * 60 * 60 * 24 * 365);
    const res = await fetch(`${baseUrl}/api/sync/status`, {
      headers: { Authorization: `Bearer ${stale}` },
    });
    expect(res.status).toBe(401);
  });
});

describe('/api/auth/spotify', () => {
  it('redirects to Spotify with a signed state', async () => {
    const res = await fetch(`${baseUrl}/api/auth/spotify`, { redirect: 'manual' });
    expect(res.status).toBe(302);

    const location = new URL(res.headers.get('location') as string);
    expect(location.host).toBe('accounts.spotify.com');
    expect(location.searchParams.get('state')).toBeTruthy();
  });
});

describe('/api/auth/callback', () => {
  // Auth problems are handed back to the SPA as a redirect with ?error=, not a
  // JSON body — the browser is mid top-level navigation.
  function errorFromRedirect(res: Response): string | null {
    const location = res.headers.get('location');
    return location ? new URL(location).searchParams.get('error') : null;
  }

  it('redirects to the web app with an error on missing code', async () => {
    const res = await fetch(`${baseUrl}/api/auth/callback`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(errorFromRedirect(res)).toBe('missing_code');
  });

  it('redirects with invalid_state for an unsigned state, before contacting Spotify', async () => {
    const res = await fetch(`${baseUrl}/api/auth/callback?code=x&state=forged`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(errorFromRedirect(res)).toBe('invalid_state');
  });

  it('propagates a user denial to the web app', async () => {
    const res = await fetch(`${baseUrl}/api/auth/callback?error=access_denied`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(302);
    expect(errorFromRedirect(res)).toBe('access_denied');
  });
});
