import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/// Unauthenticated landing screen. "Connect with Spotify" hands the whole tab
/// to the backend OAuth flow; on return the app captures the session token.
export function LoginPage() {
  const { status, notice, login } = useAuth();

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-11 w-11" aria-hidden="true">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white">LingoTrack</h1>
        <p className="mt-3 text-neutral-400">
          Learn a language through the songs you already love.
        </p>

        <button
          type="button"
          onClick={login}
          className="mt-8 w-full rounded-full bg-brand px-6 py-3.5 font-semibold text-black transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Connect with Spotify
        </button>

        {notice && <p className="mt-5 text-sm text-rose-400">{notice}</p>}
      </div>
    </main>
  );
}
