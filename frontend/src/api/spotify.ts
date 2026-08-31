import { apiRequest } from '../lib/apiClient';

/** Fetches a fresh Spotify access token for the Web Playback SDK. */
export async function getSpotifyToken(): Promise<string> {
  const { accessToken } = await apiRequest<{ accessToken: string }>('/api/spotify/token');
  return accessToken;
}

/**
 * Starts full-track playback on the SDK's device via the Spotify Web API.
 * (The SDK can pause/resume/seek itself, but starting a specific track URI
 * goes through the Web API.) Throws a friendly message on the common failures.
 */
export async function startPlayback(
  spotifyToken: string,
  deviceId: string,
  trackId: string,
): Promise<void> {
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${spotifyToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
  });

  // 202/204 = accepted/no-content (success). 404 = no active device yet.
  if (res.ok || res.status === 202 || res.status === 204) return;
  if (res.status === 403) {
    throw new Error('Playback was refused — a Spotify Premium account is required.');
  }
  if (res.status === 404) {
    throw new Error('The player device was not ready. Try again in a moment.');
  }
  throw new Error(`Could not start playback (Spotify ${res.status}).`);
}
