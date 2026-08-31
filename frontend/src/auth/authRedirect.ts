/// Parses the OAuth result the backend appends to the app URL after redirecting
/// the browser back from Spotify (`?token=` on success, `?error=` on failure).
/// Pure and unit-tested; the AuthProvider consumes it on startup.
export type AuthRedirect =
  | { type: 'token'; token: string }
  | { type: 'error'; reason: string }
  | null;

export function parseAuthRedirect(search: string): AuthRedirect {
  const params = new URLSearchParams(search);

  const token = params.get('token');
  if (token) return { type: 'token', token };

  const error = params.get('error');
  if (error) return { type: 'error', reason: error };

  return null;
}
