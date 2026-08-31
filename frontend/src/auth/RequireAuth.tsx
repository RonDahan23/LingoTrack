import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '../components/Spinner';
import { useAuth } from './AuthContext';

/// Route guard: waits while the session is being resolved, then either renders
/// the protected route or bounces to /login.
export function RequireAuth() {
  const { status } = useAuth();

  if (status === 'unknown') {
    return <Spinner label="Loading…" />;
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
