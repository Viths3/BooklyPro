import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { queryKeys } from '../../lib/query';
import { EmptyState, ErrorMessage, Loading } from '../../components/common/ui';
import { appointmentsApi, type Status } from './api';
import { AppointmentCard } from './AppointmentCard';
export function CustomerOverview() {
  const { user, session } = useAuth();
  const [from] = useState(() => new Date().toISOString());
  const queries = useQueries({
    queries: (['PENDING', 'CONFIRMED'] as Status[]).map((status) => {
      const filters = { status, from, limit: 1, page: 1 };
      return {
        queryKey: queryKeys.appointments.me(user!.id, filters),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          appointmentsApi.list(session, filters, signal),
      };
    }),
  });
  const error = queries.find((query) => query.isError)?.error;
  const next = queries
    .flatMap((query) => query.data?.data ?? [])
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0];
  const count = queries.reduce(
    (sum, query) => sum + (query.data?.pagination.total ?? 0),
    0,
  );
  return (
    <>
      <p className="eyebrow">TU CUENTA, TU ESPACIO</p>
      <h1>Bienvenido, {user?.firstName}.</h1>
      <div className="appointment-links">
        <Link className="button button-primary" to="/dashboard/appointments">
          Mis citas
        </Link>
        <Link className="text-link" to="/businesses">
          Explorar negocios ↗
        </Link>
      </div>
      <section className="appointment-section">
        <h2>Tu próxima cita</h2>
        {error ? (
          <ErrorMessage
            error={error}
            onRetry={() => queries.forEach((query) => void query.refetch())}
          />
        ) : queries.some((query) => query.isPending) ? (
          <Loading label="Consultando tu próxima cita…" />
        ) : (
          <>
            <p>{count} citas próximas al abrir este resumen.</p>
            {next ? (
              <AppointmentCard appointment={next} />
            ) : (
              <EmptyState
                title="No tienes citas próximas."
                description="Tu próximo momento empieza explorando negocios."
              />
            )}
          </>
        )}
      </section>
    </>
  );
}
