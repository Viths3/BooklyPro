import { Select } from '../../components/common/Select';
import { SuccessMessage } from '../../components/common/Feedback';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Input,
  Loading,
} from '../../components/common/ui';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useAuth } from '../auth/AuthProvider';
import {
  appointmentDate,
  statusLabels,
  statuses,
  type Status,
} from '../appointments/api';
import { ownerKeys, readAppointments, type OwnerAppointment } from './api';
import { useOwnerBusiness } from './BusinessPages';
import { useEmployees, useOwnerMutation, useServices } from './hooks';
export const transitions: Record<Status, Status[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
const actionLabels: Partial<Record<Status, string>> = {
  CONFIRMED: 'Confirmar',
  COMPLETED: 'Completar',
  CANCELLED: 'Cancelar',
  NO_SHOW: 'Marcar no asistencia',
};
const filterSchema = z.object({
  date: z.union([z.literal(''), z.iso.date()]),
  status: z.union([z.literal(''), z.enum(statuses)]),
  employeeId: z.union([z.literal(''), z.uuid()]),
  serviceId: z.union([z.literal(''), z.uuid()]),
});
type FilterInput = z.infer<typeof filterSchema>;
export function OwnerAppointmentsPage() {
  const b = useOwnerBusiness();
  const { user, session } = useAuth();
  const [params, setParams] = useSearchParams();
  const parsed = filterSchema.safeParse(
    Object.fromEntries(
      ['date', 'status', 'employeeId', 'serviceId'].map((k) => [
        k,
        params.get(k) ?? '',
      ]),
    ),
  );
  const values = parsed.success
    ? parsed.data
    : { date: '', status: '' as const, employeeId: '', serviceId: '' };
  const page = /^[1-9]\d{0,5}$/.test(params.get('page') ?? '')
    ? Number(params.get('page'))
    : 1;
  const filters = {
    ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
    page: String(page),
    limit: '10',
  };
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FilterInput>({ resolver: zodResolver(filterSchema), values });
  const query = useQuery({
    queryKey: ownerKeys.appointments(user!.id, b.id, filters),
    queryFn: ({ signal }) => readAppointments(session, b.id, filters, signal),
  });
  const employees = useEmployees(b.id);
  const services = useServices(b.id);
  const mutation = useOwnerMutation(b.id, 'appointments');
  const [confirm, setConfirm] = useState<{
    appointment: OwnerAppointment;
    status: Status;
  } | null>(null);
  function update(appointment: OwnerAppointment, status: Status) {
    mutation.mutate(
      {
        path: `/api/appointments/${appointment.id}/status`,
        method: 'PATCH',
        body: { status },
      },
      { onSettled: () => setConfirm(null) },
    );
  }
  function go(next: number) {
    setParams({ ...filters, page: String(next) });
  }
  return (
    <>
      <h2>Reservas del negocio</h2>
      <p>Fechas y horas en {b.timeZone}.</p>
      <form
        className="owner-filters"
        onSubmit={handleSubmit((input) =>
          setParams({
            ...Object.fromEntries(Object.entries(input).filter(([, v]) => v)),
            page: '1',
          }),
        )}
      >
        <Input
          id="owner-date"
          label="Fecha"
          type="date"
          {...register('date')}
          error={errors.date?.message}
        />
        <Select
          id="filter-status"
          label="Estado"
          {...register('status')}
          error={errors.status?.message}
        >
          <option value="">Todos</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </Select>
        <Select
          id="filter-employeeId"
          label="Empleado"
          {...register('employeeId')}
          error={errors.employeeId?.message}
        >
          <option value="">Todos</option>
          {employees.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </Select>
        <Select
          id="filter-serviceId"
          label="Servicio"
          {...register('serviceId')}
          error={errors.serviceId?.message}
        >
          <option value="">Todos</option>
          {services.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Button type="submit">Filtrar</Button>
        <Button variant="secondary" onClick={() => setParams({})}>
          Limpiar filtros
        </Button>
      </form>
      {(employees.error || services.error) && (
        <ErrorMessage error={employees.error || services.error} />
      )}
      {mutation.isSuccess && (
        <SuccessMessage>Cambios guardados.</SuccessMessage>
      )}
      {mutation.error && (
        <>
          <ErrorMessage error={mutation.error} />
          <p>
            Si otra persona cambió la reserva, la lista se habrá actualizado.
            Revisa su estado antes de intentar otra acción.
          </p>
        </>
      )}
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorMessage
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {!query.data.data.length ? (
            <EmptyState
              title="Sin reservas"
              description="No hay reservas que coincidan con estos filtros."
            />
          ) : (
            query.data.data.map((a) => (
              <Card key={a.id}>
                <StatusBadge status={a.status} />
                <h3>{a.service.name}</h3>
                <p>
                  Cliente: {a.customer.firstName} {a.customer.lastName}
                </p>
                <p>
                  Empleado: {a.employee.firstName} {a.employee.lastName}
                </p>
                <p>
                  {appointmentDate(a.startTime, b.timeZone, 'date')} ·{' '}
                  {appointmentDate(a.startTime, b.timeZone, 'time')}–
                  {appointmentDate(a.endTime, b.timeZone, 'time')}
                </p>
                <p>
                  {a.priceAtBooking} {b.currency}
                </p>
                {a.notes && <p>Notas: {a.notes}</p>}
                <div className="appointment-links">
                  {transitions[a.status].map((status) => (
                    <Button
                      key={status}
                      disabled={mutation.isPending}
                      variant="secondary"
                      onClick={() => {
                        mutation.reset();
                        if (status === 'CANCELLED' || status === 'NO_SHOW')
                          setConfirm({ appointment: a, status });
                        else update(a, status);
                      }}
                    >
                      {actionLabels[status]}
                    </Button>
                  ))}
                </div>
              </Card>
            ))
          )}
          <div className="appointment-links">
            <Button disabled={page <= 1} onClick={() => go(page - 1)}>
              Anterior
            </Button>
            <span>
              Página {page} de {Math.max(1, query.data.pagination.totalPages)} ·{' '}
              {query.data.pagination.total} reservas
            </span>
            <Button
              disabled={page >= query.data.pagination.totalPages}
              onClick={() => go(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.status === 'CANCELLED'
              ? '¿Cancelar reserva?'
              : '¿Marcar que el cliente no asistió?'
          }
          description="La reserva pasará a un estado definitivo. Esta acción no puede deshacerse."
          confirmLabel={actionLabels[confirm.status]}
          closeLabel="Volver"
          busy={mutation.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={() => update(confirm.appointment, confirm.status)}
        />
      )}
    </>
  );
}
