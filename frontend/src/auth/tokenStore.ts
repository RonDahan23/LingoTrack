/// The session token lives in localStorage. It's an opaque, backend-signed
/// token (the Spotify tokens never reach the browser), sent as a Bearer header.
const KEY = 'lingotrack.session';

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage disabled / unavailable
  }
}

export function setToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
}
