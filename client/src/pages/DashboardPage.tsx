import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { Card, EmptyState } from '../components/common/ui';
export function DashboardPage() {
  const { user } = useAuth();
  return (
    <>
      <p className="eyebrow">TU CUENTA, TU ESPACIO</p>
      <h1>Bienvenido, {user?.firstName}.</h1>
      <p className="muted">Todo empieza por encontrar un buen lugar.</p>
      <div className="dashboard-cards">
        <Card>
          <span className="badge">Tu cuenta</span>
          <h2>
            {user?.firstName} {user?.lastName}
          </h2>
          <p>{user?.email}</p>
        </Card>
        <Card>
          <span className="badge">Descubre</span>
          <h2>Haz espacio para algo bueno.</h2>
          <p>
            Conoce negocios, sus servicios y las experiencias de otros clientes.
          </p>
          <Link to="/businesses" className="text-link">
            Explorar negocios ↗
          </Link>
        </Card>
      </div>
    </>
  );
}
export function DashboardPlaceholder({
  kind,
}: {
  kind: 'appointments' | 'businesses';
}) {
  return (
    <>
      <p className="eyebrow">MI ESPACIO</p>
      <h1>{kind === 'appointments' ? 'Mis citas' : 'Mis negocios'}</h1>
      <EmptyState
        title="Este espacio estará disponible pronto"
        description={
          kind === 'appointments'
            ? 'Aquí podrás consultar y gestionar tus citas cuando se habilite la reserva online.'
            : 'Aquí podrás gestionar tus negocios cuando se habiliten las herramientas de administración.'
        }
      />
      <Link className="text-link" to="/businesses">
        Mientras tanto, explora negocios ↗
      </Link>
    </>
  );
}
