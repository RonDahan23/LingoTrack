import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast on a bad environment: every consumer imports `env` and gets a
 * fully-typed, already-validated object rather than raw `process.env` strings.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // PostgreSQL connection string, e.g.
  // postgresql://user:password@host:5432/lingotrack?schema=public
  // In production this is provided by Railway's Postgres plugin.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  SPOTIFY_CLIENT_ID: z.string().min(1, 'SPOTIFY_CLIENT_ID is required'),
  SPOTIFY_CLIENT_SECRET: z.string().min(1, 'SPOTIFY_CLIENT_SECRET is required'),
  SPOTIFY_REDIRECT_URI: z
    .string()
    .url('SPOTIFY_REDIRECT_URI must be an absolute URL')
    .describe('Must match a Redirect URI registered on the Spotify app dashboard, byte for byte'),

  // 32 bytes of hex. Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  // Signs OAuth `state` values and client session tokens.
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(720),

  // Origin of the Flutter Web app. Two roles:
  //   1. /api/auth/callback redirects the browser here with ?token= (or ?error=)
  //      once the session token is minted — the SPA reads it from its own URL.
  //   2. The allowed CORS origin for the SPA's XHR calls to this API.
  // Must be a bare origin (scheme://host[:port]), no trailing slash or path.
  WEB_APP_URL: z
    .string()
    .url('WEB_APP_URL must be an absolute URL')
    .default('http://localhost:5199'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
