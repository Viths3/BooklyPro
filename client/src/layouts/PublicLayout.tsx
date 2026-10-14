import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="BooklyPro, inicio">
      <span className="brand-icon" aria-hidden="true">
        B
      </span>
      <span>
        Bookly<span className="brand-suffix">Pro</span>
      </span>
    </Link>
  );
}
export function PublicLayout() {
  const { user } = useAuth();
  return (
    <>
      <a className="skip-link" href="#content">
        Saltar al contenido
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav aria-label="Navegación principal">
            <NavLink to="/businesses">Explorar negocios</NavLink>
            {user ? (
              <Link className="button button-primary" to="/dashboard">
                Mi espacio <span aria-hidden="true">↗</span>
              </Link>
            ) : (
              <>
                <NavLink to="/login" className="login-link">
                  Iniciar sesión
                </NavLink>
                <Link className="button button-primary" to="/register">
                  Crear cuenta <span aria-hidden="true">↗</span>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <Brand />
          <p>Reservas y gestión de negocios.</p>
          <Link to="/businesses">
            Explorar el catálogo <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="container footer-bottom">
          © {new Date().getFullYear()} BooklyPro
        </div>
      </footer>
    </>
  );
}
