// Minimal typings for the Spotify Web Playback SDK (loaded at runtime from
// https://sdk.scdn.co/spotify-player.js) — only the surface useSpotifyPlayer uses.
export {};

declare global {
  interface Window {
    Spotify?: typeof Spotify;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }

  namespace Spotify {
    interface PlayerInit {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    }

    interface WebPlaybackState {
      paused: boolean;
      position: number; // ms
      duration: number; // ms
    }

    interface ReadyEvent {
      device_id: string;
    }
    interface ErrorEvent {
      message: string;
    }

    interface PlayerEvents {
      ready: ReadyEvent;
      not_ready: ReadyEvent;
      player_state_changed: WebPlaybackState | null;
      initialization_error: ErrorEvent;
      authentication_error: ErrorEvent;
      account_error: ErrorEvent;
      playback_error: ErrorEvent;
    }

    interface Player {
      connect(): Promise<boolean>;
      disconnect(): void;
      getCurrentState(): Promise<WebPlaybackState | null>;
      pause(): Promise<void>;
      resume(): Promise<void>;
      togglePlay(): Promise<void>;
      seek(positionMs: number): Promise<void>;
      setVolume(volume: number): Promise<void>;
      addListener<E extends keyof PlayerEvents>(
        event: E,
        cb: (payload: PlayerEvents[E]) => void,
      ): boolean;
      removeListener(event: keyof PlayerEvents): boolean;
    }

    const Player: {
      new (init: PlayerInit): Player;
    };
  }
}
