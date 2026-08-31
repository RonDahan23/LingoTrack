import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { API_BASE_URL } from '../config';
import { setUnauthorizedHandler } from '../lib/apiClient';
import { parseAuthRedirect } from './authRedirect';
import { clearToken, getToken, setToken } from './tokenStore';

type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  notice: string | null;
  /** Full-page redirect into the backend's Spotify OAuth flow. */
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('unknown');
  const [notice, setNotice] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    // Guard against React 18 StrictMode's double-invoke (idempotent anyway).
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const redirect = parseAuthRedirect(window.location.search);
    if (redirect?.type === 'token') {
      setToken(redirect.token);
      stripQuery(); // don't leave the token in the URL / history
      setStatus('authenticated');
      return;
    }
    if (redirect?.type === 'error') {
      stripQuery();
      setNotice(`Login failed: ${redirect.reason}`);
      setStatus('unauthenticated');
      return;
    }

    setStatus(getToken() ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    // A 401 from any request expires the session and routes back to login.
    setUnauthorizedHandler(() => {
      setNotice('Your session expired. Please sign in again.');
      setStatus('unauthenticated');
    });
  }, []);

  const login = useCallback(() => {
    window.location.href = `${API_BASE_URL}/api/auth/spotify`;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setNotice(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, notice, login, logout }),
    [status, notice, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function stripQuery(): void {
  window.history.replaceState(null, '', window.location.pathname);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
