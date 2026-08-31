import { useCallback, useEffect, useRef, useState } from 'react';
import { getSpotifyToken, startPlayback } from '../api/spotify';

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
const INITIAL_VOLUME = 0.8;

type PlayerStatus = 'loading' | 'ready' | 'error';

export interface SpotifyPlayer {
  status: PlayerStatus;
  error: string | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  /** Playback volume, 0.0–1.0. */
  volume: number;
  /** Start playing a track by id on this device (needs Premium). */
  playTrack: (trackId: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
}

let sdkPromise: Promise<void> | null = null;

/** Loads the Web Playback SDK script once, resolving when it's ready. */
function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load the Spotify SDK'));
    document.body.appendChild(script);
  });
  return sdkPromise;
}

function friendlyError(event: string, message: string): string {
  if (event === 'account_error') return 'Full playback requires Spotify Premium.';
  if (event === 'authentication_error') {
    return 'Spotify authentication failed — sign out and reconnect to grant playback access.';
  }
  return message || 'The Spotify player hit an error.';
}

/**
 * Wraps the Spotify Web Playback SDK as a React hook. Exposes playback controls
 * and a live `positionMs` (polled while playing) that the player uses to drive
 * synchronized lyrics. Requires the user's account to be Premium at play time.
 */
export function useSpotifyPlayer(): SpotifyPlayer {
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolumeState] = useState(INITIAL_VOLUME);

  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const hasBeenReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    loadSdk()
      .then(() => {
        if (cancelled || !window.Spotify) return;

        const player = new window.Spotify.Player({
          name: 'LingoTrack Web Player',
          getOAuthToken: (cb) => {
            getSpotifyToken()
              .then(cb)
              .catch(() => setError('Could not obtain a Spotify token.'));
          },
          volume: INITIAL_VOLUME,
        });

        player.addListener('ready', ({ device_id }) => {
          deviceIdRef.current = device_id;
          hasBeenReadyRef.current = true;
          if (!cancelled) {
            // Device connected & authenticated successfully. Clear any transient
            // auth error the SDK may have emitted during startup handshake —
            // otherwise a stale "authentication failed" note lingers even though
            // playback is fully ready.
            setStatus('ready');
            setError(null);
          }
        });
        player.addListener('not_ready', () => {
          deviceIdRef.current = null;
        });
        player.addListener('player_state_changed', (state) => {
          if (!state || cancelled) return;
          setIsPlaying(!state.paused);
          setPositionMs(state.position);
          setDurationMs(state.duration);
          // Real playback state is flowing, so any earlier transient auth error
          // is stale — clear it so the note doesn't linger while music plays.
          setStatus('ready');
          setError(null);
        });
        for (const event of [
          'initialization_error',
          'authentication_error',
          'account_error',
          'playback_error',
        ] as const) {
          player.addListener(event, ({ message }) => {
            if (cancelled) return;
            // Once the device has connected, the SDK re-requests the token via
            // getOAuthToken and recovers from transient token-handshake blips on
            // its own — don't surface those as fatal. Real blockers before ready
            // (e.g. account_error for non-Premium) still show.
            if (
              hasBeenReadyRef.current &&
              (event === 'authentication_error' || event === 'initialization_error')
            ) {
              return;
            }
            setStatus('error');
            setError(friendlyError(event, message));
          });
        }

        player.connect();
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          setError('Failed to load the Spotify player.');
        }
      });

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, []);

  // While playing, poll the real playback position for smooth lyric sync.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (state) {
        setPositionMs(state.position);
        setIsPlaying(!state.paused);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  const playTrack = useCallback(async (trackId: string) => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) throw new Error('The player is not ready yet.');
    const token = await getSpotifyToken();
    await startPlayback(token, deviceId, trackId);
  }, []);

  const pause = useCallback(async () => {
    await playerRef.current?.pause();
  }, []);
  const resume = useCallback(async () => {
    await playerRef.current?.resume();
  }, []);
  const seek = useCallback(async (ms: number) => {
    await playerRef.current?.seek(ms);
    setPositionMs(ms);
  }, []);

  const setVolume = useCallback(async (next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    setVolumeState(clamped); // update the slider immediately
    await playerRef.current?.setVolume(clamped);
  }, []);

  return {
    status,
    error,
    isPlaying,
    positionMs,
    durationMs,
    volume,
    playTrack,
    pause,
    resume,
    seek,
    setVolume,
  };
}
