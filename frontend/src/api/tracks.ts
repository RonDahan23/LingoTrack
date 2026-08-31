import { apiRequest } from '../lib/apiClient';
import type { RankedTracks, TrackDetail } from '../types/track';

export function fetchRankedTracks(): Promise<RankedTracks> {
  return apiRequest<RankedTracks>('/api/tracks/ranked');
}

export function fetchTrack(trackId: string): Promise<TrackDetail> {
  return apiRequest<TrackDetail>(`/api/tracks/${encodeURIComponent(trackId)}`);
}

export interface PrepareResult {
  prepared: boolean;
  level: string;
  score: number;
  reason?: string;
}

/** Fetches real synced lyrics (LRCLIB) for a track and grades it. */
export function prepareTrack(trackId: string): Promise<PrepareResult> {
  return apiRequest<PrepareResult>(`/api/tracks/${encodeURIComponent(trackId)}/prepare`, {
    method: 'POST',
  });
}

/** Kicks off a background sync of the user's Spotify liked songs (202/409). */
export function startLibrarySync(): Promise<{ started: boolean }> {
  return apiRequest<{ started: boolean }>('/api/sync/liked-tracks', {
    method: 'POST',
  });
}

export interface GradeStatus {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  total: number;
  processed: number;
  graded: number;
}

/** Starts the background "fetch lyrics + grade every track" job (202/409). */
export function startGradeLibrary(): Promise<{ started: boolean }> {
  return apiRequest<{ started: boolean }>('/api/tracks/grade-library', {
    method: 'POST',
  });
}

export function getGradeStatus(): Promise<GradeStatus> {
  return apiRequest<GradeStatus>('/api/tracks/grade-status');
}
