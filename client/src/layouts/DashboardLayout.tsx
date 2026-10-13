import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { Brand } from './PublicLayout';
import { Button } from '../components/common/ui';
export function DashboardLayout() {
  const { user, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function logout() {
    setBusy(true);
    try {
      await session.logout();
      navigate('/login', { replace: true });
    } catch {
      navigate('/login', {
        replace: true,
        state: {
          notice:
            'Cerramos la sesión en este navegador. No pudimos confirmar la revocación remota; el token expirará según su vigencia.',
        },
      });
    }
  }
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#content">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Brand />
        <p className="eyebrow">MI ESPACIO</p>
        <nav aria-label="Panel personal">
          <NavLink to="/dashboard" end>
            Inicio
          </NavLink>
          <NavLink to="/dashboard/appointments">Mis citas</NavLink>
          <NavLink to="/dashboard/businesses">Mis negocios</NavLink>
          <NavLink to="/businesses">Explorar negocios ↗</NavLink>
        </nav>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-header">
          <span>
            Hola, <strong>{user?.firstName}</strong>
          </span>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void logout()}
          >
            {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Button>
        </header>
        <main id="content" className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
