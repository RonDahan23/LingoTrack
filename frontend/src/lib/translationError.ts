/**
 * Turns a failed `/api/translate` call into something a learner can act on.
 *
 * The backend walks a chain of free translation providers, so a failure here is
 * almost always "every provider was rate-limited or down" rather than anything
 * wrong with the tapped word — a flat "Translation failed" left no way to tell
 * that apart from being offline. Duck-typed on `status` rather than importing
 * `ApiError`, so this stays a dependency-free pure function.
 */
export function translationError(err: unknown): string {
  const status = typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : null;

  // `apiClient` uses status 0 for "never reached the server".
  if (status === 0) return 'No connection — check your network';
  if (status === 429 || status === 502 || status === 503) {
    return 'Translation service is busy — try again in a moment';
  }

  const message = err instanceof Error ? err.message.trim() : '';
  return message || 'Translation failed';
}
