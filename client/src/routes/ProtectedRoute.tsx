import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { Loading, EmptyState } from '../components/common/ui';
import type { User } from '../features/auth/schemas';
export function ProtectedRoute({ roles }: { roles?: User['role'][] }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="Comprobando tu sesión…" />;
  if (!user)
    return (
      <Navigate to="/login" replace state={{ returnTo: location.pathname }} />
    );
  if (roles && !roles.includes(user.role))
    return (
      <EmptyState
        title="Acceso restringido"
        description="Tu cuenta no tiene acceso a esta sección."
      />
    );
  return <Outlet />;
}
