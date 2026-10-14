import { useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Loading,
} from '../../components/common/ui';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useAuth } from '../auth/AuthProvider';
import {
  businessSchema,
  ownerKeys,
  readAppointments,
  type Business,
} from './api';
import {
  useEmployees,
  useOwnedBusinesses,
  useOwnerMutation,
  useServices,
} from './hooks';
import { OwnerForm } from './OwnerForm';
import { appointmentDate } from '../appointments/api';

export function ActiveState({ active }: { active: boolean }) {
  return <span className="owner-state">{active ? 'Activo' : 'Inactivo'}</span>;
}
export function BusinessList() {
  const query = useOwnedBusinesses();
  const mutation = useOwnerMutation('', 'business');
  const { session } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string>();
  const [syncError, setSyncError] = useState<unknown>();
  const [syncing, setSyncing] = useState(false);
  async function sync(id: string) {
    setSyncing(true);
    try {
      await session.syncUser();
      navigate(`/dashboard/businesses/${id}`);
    } catch (error) {
      setSyncError(error);
    } finally {
      setSyncing(false);
    }
  }
  return (
    <section>
      <p className="eyebrow">GESTIÓN</p>
      <h1>Mis negocios</h1>
      <p>Organiza tus servicios, equipo y reservas.</p>
      {!creating && !created && (
        <Button onClick={() => setCreating(true)}>Crear negocio</Button>
      )}
      {creating && !created && (
        <OwnerForm
          kind="business"
          busy={mutation.isPending}
          onClose={() => setCreating(false)}
          onSave={(body) =>
            mutation.mutate(
              { path: '/api/businesses', method: 'POST', body },
              {
                onSuccess: (result) => {
                  const business = businessSchema.parse(
                    (result as { data: unknown }).data,
                  );
                  setCreated(business.id);
                  void sync(business.id);
                },
              },
            )
          }
        />
      )}
      {mutation.error && <ErrorMessage error={mutation.error} />}
      {created && (
        <Card>
          <p>Negocio creado. Estamos actualizando los permisos de tu sesión.</p>
          {Boolean(syncError) && <ErrorMessage error={syncError} />}
          <Button disabled={syncing} onClick={() => void sync(created)}>
            Actualizar sesión
          </Button>
        </Card>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorMessage
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data.length ? (
        <EmptyState
          title="Aún no tienes negocios"
          description="Crea tu primer negocio para comenzar."
        />
      ) : (
        <div className="owner-grid">
          {query.data.map((b) => (
            <Card key={b.id}>
              <ActiveState active={b.active} />
              <h2>{b.name}</h2>
              <p>{b.address || 'Sin dirección'}</p>
              <Link
                className="button button-secondary"
                to={`/dashboard/businesses/${b.id}`}
              >
                Gestionar {b.name}
              </Link>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
export function OwnerBusinessLayout() {
  const { businessId } = useParams();
  const { user } = useAuth();
  const query = useOwnedBusinesses();
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />
    );
  const business = query.data.find((b) => b.id === businessId);
  if (!business || user?.role === 'CUSTOMER')
    return (
      <EmptyState
        title="Acceso no permitido"
        description="Solo puedes gestionar negocios de los que eres propietario. Vuelve a Mis negocios."
      />
    );
  return (
    <section>
      <Link to="/dashboard/businesses">← Mis negocios</Link>
      <h1>{business.name}</h1>
      <ActiveState active={business.active} />
      {!business.active && (
        <p role="status">
          Negocio inactivo. No acepta nuevas reservas ni cambios de servicios,
          empleados u horarios.
        </p>
      )}
      <nav className="owner-nav" aria-label="Gestionar negocio">
        {[
          ['', 'Resumen'],
          ['services', 'Servicios'],
          ['employees', 'Empleados'],
          ['schedules', 'Horarios'],
          ['appointments', 'Reservas'],
        ].map(([path, label]) => (
          <NavLink
            key={path}
            end
            to={`/dashboard/businesses/${business.id}${path ? `/${path}` : ''}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={business} />
    </section>
  );
}
export function useOwnerBusiness() {
  return useOutletContext<Business>();
}
function BusinessSummary() {
  const b = useOwnerBusiness();
  const { user, session } = useAuth();
  const services = useServices(b.id);
  const employees = useEmployees(b.id);
  const [now] = useState(() => new Date().toISOString());
  const filters = { from: now, limit: '1', status: 'PENDING' };
  const pending = useQuery({
    queryKey: ownerKeys.appointments(user!.id, b.id, filters),
    queryFn: ({ signal }) => readAppointments(session, b.id, filters, signal),
  });
  const confirmedFilters = { ...filters, status: 'CONFIRMED' };
  const confirmed = useQuery({
    queryKey: ownerKeys.appointments(user!.id, b.id, confirmedFilters),
    queryFn: ({ signal }) =>
      readAppointments(session, b.id, confirmedFilters, signal),
  });
  const next = [
    ...(pending.data?.data ?? []),
    ...(confirmed.data?.data ?? []),
  ].sort((a, c) => a.startTime.localeCompare(c.startTime))[0];
  const error =
    services.error || employees.error || pending.error || confirmed.error;
  return (
    <>
      <div className="owner-grid">
        <Card>
          <h3>Servicios activos</h3>
          <p>{services.data?.filter((s) => s.active).length ?? '…'}</p>
        </Card>
        <Card>
          <h3>Empleados activos</h3>
          <p>{employees.data?.filter((e) => e.active).length ?? '…'}</p>
        </Card>
        <Card>
          <h3>Próximas reservas</h3>
          <p>
            {pending.data && confirmed.data
              ? pending.data.pagination.total + confirmed.data.pagination.total
              : '…'}
          </p>
          {next && (
            <p>
              {next.service.name} ·{' '}
              {appointmentDate(next.startTime, b.timeZone, 'date')}{' '}
              {appointmentDate(next.startTime, b.timeZone, 'time')}
            </p>
          )}
        </Card>
      </div>
      {error && <ErrorMessage error={error} />}
    </>
  );
}
export function BusinessOverview() {
  const b = useOwnerBusiness();
  const mutation = useOwnerMutation(b.id, 'business');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <h2>Resumen del negocio</h2>
      <BusinessSummary />
      <Card>
        <p>{b.description || 'Sin descripción'}</p>
        <p>{b.address}</p>
        <p>{b.phone}</p>
        <p>
          Zona horaria: {b.timeZone} · Moneda: {b.currency}
        </p>
        <div className="appointment-links">
          <Button
            disabled={mutation.isPending}
            onClick={() => setEditing(true)}
          >
            Editar negocio
          </Button>
          {b.active && (
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => setConfirm(true)}
            >
              Desactivar negocio
            </Button>
          )}
        </div>
        {editing && (
          <OwnerForm
            kind="business"
            initial={Object.fromEntries(
              ['name', 'description', 'phone', 'address', 'imageUrl'].map(
                (key) => [key, String(b[key as keyof Business] ?? '')],
              ),
            )}
            busy={mutation.isPending}
            onClose={() => setEditing(false)}
            onSave={(body) =>
              mutation.mutate(
                { path: `/api/businesses/${b.id}`, method: 'PATCH', body },
                { onSuccess: () => setEditing(false) },
              )
            }
          />
        )}
        {mutation.error && <ErrorMessage error={mutation.error} />}
      </Card>
      {confirm && (
        <ConfirmDialog
          title="¿Desactivar negocio?"
          description="Dejará de aparecer al público y de aceptar reservas. La API no ofrece reactivación."
          confirmLabel="Desactivar"
          closeLabel="Volver"
          busy={mutation.isPending}
          onClose={() => setConfirm(false)}
          onConfirm={() =>
            mutation.mutate(
              { path: `/api/businesses/${b.id}`, method: 'DELETE' },
              { onSettled: () => setConfirm(false) },
            )
          }
        />
      )}
    </>
  );
}
