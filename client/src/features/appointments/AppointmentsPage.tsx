import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  Button,
  EmptyState,
  ErrorMessage,
  Loading,
} from '../../components/common/ui';
import { queryKeys } from '../../lib/query';
import { appointmentsApi, isUpcoming, statuses, statusLabels } from './api';
import { AppointmentCard } from './AppointmentCard';
export function AppointmentsPage() {
  const { session, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = statuses.find((value) => value === params.get('status'));
  const requested = Number(params.get('page') ?? 1);
  const page =
    Number.isInteger(requested) && requested > 0 && requested <= 1000000
      ? requested
      : 1;
  const filters = { status, page, limit: 10 };
  const query = useQuery({
    queryKey: queryKeys.appointments.me(user!.id, filters),
    queryFn: ({ signal }) => appointmentsApi.list(session, filters, signal),
  });
  const go = (next: number) =>
    setParams({ ...(status ? { status } : {}), page: String(next) });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const upcoming =
    query.data?.data.filter((item) => isUpcoming(item, now)) ?? [];
  const history =
    query.data?.data.filter((item) => !isUpcoming(item, now)) ?? [];
  return (
    <>
      <p className="eyebrow">TU AGENDA</p>
      <h1>Mis citas</h1>
      <div className="field appointment-filter">
        <label htmlFor="appointment-status">Filtrar por estado</label>
        <select
          id="appointment-status"
          value={status ?? ''}
          onChange={(event) =>
            setParams(event.target.value ? { status: event.target.value } : {})
          }
        >
          <option value="">Todos</option>
          {statuses.map((value) => (
            <option value={value} key={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
      </div>
      {query.isPending ? (
        <Loading label="Cargando tus citas…" />
      ) : query.isError ? (
        <ErrorMessage
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <p className="muted">
            {query.data.pagination.total} citas
            {status ? ` · ${statusLabels[status]}` : ''}. Las secciones muestran
            los resultados de esta página, ordenados por fecha.
          </p>
          {query.data.data.length === 0 ? (
            <EmptyState
              title={
                status
                  ? 'No hay citas con este estado.'
                  : 'Todavía no tienes citas en esta página.'
              }
              description="Explora negocios y encuentra tu próximo momento."
            />
          ) : (
            <>
              <section className="appointment-section">
                <h2>Próximas citas</h2>
                {upcoming.length ? (
                  <div className="appointment-grid">
                    {upcoming.map((item) => (
                      <AppointmentCard key={item.id} appointment={item} />
                    ))}
                  </div>
                ) : (
                  <p>No hay citas próximas en esta página.</p>
                )}
              </section>
              <section className="appointment-section">
                <h2>Historial</h2>
                {history.length ? (
                  <div className="appointment-grid">
                    {history.map((item) => (
                      <AppointmentCard key={item.id} appointment={item} />
                    ))}
                  </div>
                ) : (
                  <p>No hay citas de historial en esta página.</p>
                )}
              </section>
            </>
          )}
          <nav className="pagination" aria-label="Paginación de citas">
            <Button
              variant="secondary"
              disabled={page <= 1 || query.isFetching}
              onClick={() => go(page - 1)}
            >
              Anterior
            </Button>
            <span>
              Página {query.data.pagination.page} de{' '}
              {Math.max(1, query.data.pagination.totalPages)}
            </span>
            <Button
              variant="secondary"
              disabled={
                page >= query.data.pagination.totalPages || query.isFetching
              }
              onClick={() => go(page + 1)}
            >
              Siguiente
            </Button>
          </nav>
        </>
      )}
      <Link className="text-link" to="/businesses">
        Explorar negocios ↗
      </Link>
    </>
  );
}
