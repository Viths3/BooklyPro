import { Select } from '../../components/common/Select';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, ErrorMessage, Loading } from '../../components/common/ui';
import { ApiError } from '../../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useOwnerBusiness } from './BusinessPages';
import { useEmployees, useOwnerMutation } from './hooks';
import {
  businessDaySchema,
  employeeDaySchema,
  days,
  dayLabels,
  ownerKeys,
  readList,
} from './api';
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Usa HH:mm.');
export const weekSchema = z.object({
  days: z
    .array(
      z
        .object({
          dayOfWeek: z.enum(days),
          active: z.boolean(),
          start: time,
          end: time,
        })
        .refine((d) => !d.active || d.start < d.end, {
          path: ['end'],
          message:
            'El cierre debe ser posterior al inicio, sin turnos nocturnos.',
        }),
    )
    .length(7),
});
type Week = z.infer<typeof weekSchema>;
export function scheduleSchema(businessWeek?: Week) {
  return weekSchema.superRefine((week, ctx) => {
    if (!businessWeek) return;
    week.days.forEach((day, i) => {
      const opening = businessWeek.days.find(
        (row) => row.dayOfWeek === day.dayOfWeek,
      );
      if (
        day.active &&
        (!opening?.active || day.start < opening.start || day.end > opening.end)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['days', i, 'end'],
          message: opening?.active
            ? `El horario del empleado debe estar dentro del horario del negocio: ${opening.start}–${opening.end}.`
            : 'El negocio está cerrado este día. Desactiva el día del empleado o actualiza primero el horario del negocio.',
        });
    });
  });
}
export function copyMonday(week: Week): Week {
  const monday = week.days[0]!;
  return {
    days: week.days.map((day, i) =>
      i > 0 && i < 5
        ? {
            ...day,
            active: monday.active,
            start: monday.start,
            end: monday.end,
          }
        : { ...day },
    ),
  };
}
export function scheduleBody(week: Week, employee: boolean) {
  return {
    schedules: week.days.map(({ dayOfWeek, active, start, end }) => ({
      dayOfWeek,
      active,
      ...(employee
        ? { startTime: start, endTime: end }
        : { openingTime: start, closingTime: end }),
    })),
  };
}
function WeekForm({
  initial,
  employee,
  path,
  businessWeek,
}: {
  initial: Week;
  employee: boolean;
  path: string;
  businessWeek?: Week;
}) {
  const b = useOwnerBusiness();
  const mutation = useOwnerMutation(b.id, 'schedules');
  const {
    register,
    control,
    getValues,
    setValue,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<Week>({
    resolver: zodResolver(scheduleSchema(businessWeek)),
    defaultValues: initial,
  });
  const current = useWatch({ control, name: 'days' });
  return (
    <form
      onSubmit={handleSubmit((week) =>
        mutation.mutate(
          { path, method: 'PUT', body: scheduleBody(week, employee) },
          { onSuccess: () => reset(week) },
        ),
      )}
    >
      <fieldset disabled={mutation.isPending}>
        <legend>
          {employee ? 'Horario del empleado' : 'Horario del negocio'} ·{' '}
          {b.timeZone}
        </legend>
        <div className="schedule-tools">
          <Button
            variant="secondary"
            onClick={() =>
              setValue('days', copyMonday(getValues()).days, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          >
            Copiar lunes a martes–viernes
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setValue(
                'days',
                getValues('days').map((day) => ({ ...day, active: false })),
                { shouldDirty: true, shouldValidate: true },
              )
            }
          >
            Cerrar toda la semana
          </Button>
        </div>
        <p className="schedule-hint">
          Los cambios se aplican al pulsar Guardar semana.
        </p>
        {days.map((day, i) => (
          <div className="owner-week-row" key={day}>
            <label>
              <input type="checkbox" {...register(`days.${i}.active`)} />
              {dayLabels[i]} abierto
            </label>
            <span className="schedule-day-state">
              {current[i]?.active
                ? employee
                  ? 'Disponible'
                  : 'Abierto'
                : 'Cerrado'}
            </span>
            {businessWeek && (
              <p className="business-hours-context">
                Negocio:{' '}
                {businessWeek.days[i]?.active
                  ? `${businessWeek.days[i]!.start}–${businessWeek.days[i]!.end}`
                  : 'Cerrado'}
              </p>
            )}
            <label>
              {employee ? 'Inicio' : 'Apertura'} {dayLabels[i]}
              <input
                type="time"
                readOnly={!current[i]?.active}
                aria-disabled={!current[i]?.active}
                aria-describedby={
                  errors.days?.[i]?.start || errors.days?.[i]?.end
                    ? `schedule-${day}-error`
                    : undefined
                }
                {...register(`days.${i}.start`)}
                aria-invalid={Boolean(errors.days?.[i]?.start)}
              />
            </label>
            <label>
              {employee ? 'Fin' : 'Cierre'} {dayLabels[i]}
              <input
                type="time"
                readOnly={!current[i]?.active}
                aria-disabled={!current[i]?.active}
                aria-describedby={
                  errors.days?.[i]?.start || errors.days?.[i]?.end
                    ? `schedule-${day}-error`
                    : undefined
                }
                {...register(`days.${i}.end`)}
                aria-invalid={Boolean(errors.days?.[i]?.end)}
              />
            </label>
            {(errors.days?.[i]?.start || errors.days?.[i]?.end) && (
              <p role="alert" id={`schedule-${day}-error`}>
                {errors.days?.[i]?.start?.message ||
                  errors.days?.[i]?.end?.message}
              </p>
            )}
          </div>
        ))}
        <Button type="submit" disabled={!isDirty}>
          {mutation.isPending ? 'Guardando…' : 'Guardar semana'}
        </Button>
      </fieldset>
      {mutation.error instanceof ApiError && mutation.error.status === 409 ? (
        <p role="alert">
          No se pudo guardar: revisa que los horarios del empleado estén dentro
          de la apertura del negocio y que el negocio siga activo. Ningún
          horario se ha cambiado.
        </p>
      ) : (
        mutation.error && <ErrorMessage error={mutation.error} />
      )}
      {mutation.isSuccess && !isDirty && <p role="status">Horario guardado.</p>}
    </form>
  );
}
function WeekEditor({ employeeId }: { employeeId: string }) {
  const b = useOwnerBusiness();
  const { user, session } = useAuth();
  const path = employeeId
    ? `/api/employees/${employeeId}/schedules`
    : `/api/businesses/${b.id}/schedules`;
  const query = useQuery({
    queryKey: ownerKeys.section(user!.id, b.id, 'schedules', employeeId),
    queryFn: async ({ signal }) => {
      const rows = employeeId
        ? await readList(session, path, employeeDaySchema, signal)
        : await readList(session, path, businessDaySchema, signal);
      return {
        days: days.map((day) => {
          const row = rows.find((r) => r.dayOfWeek === day);
          return {
            dayOfWeek: day,
            active: row?.active ?? false,
            start: row
              ? 'startTime' in row
                ? row.startTime
                : row.openingTime
              : '09:00',
            end: row
              ? 'endTime' in row
                ? row.endTime
                : row.closingTime
              : '18:00',
          };
        }),
      };
    },
  });
  const businessHours = useQuery({
    queryKey: ownerKeys.section(user!.id, b.id, 'schedules', ''),
    enabled: Boolean(employeeId),
    queryFn: async ({ signal }) => {
      const rows = await readList(
        session,
        `/api/businesses/${b.id}/schedules`,
        businessDaySchema,
        signal,
      );
      return {
        days: days.map((day) => {
          const row = rows.find((item) => item.dayOfWeek === day);
          return {
            dayOfWeek: day,
            active: row?.active ?? false,
            start: row?.openingTime ?? '09:00',
            end: row?.closingTime ?? '18:00',
          };
        }),
      };
    },
  });
  if (employeeId && businessHours.isPending)
    return <Loading label="Consultando el horario del negocio…" />;
  if (employeeId && businessHours.error)
    return (
      <ErrorMessage
        error={businessHours.error}
        onRetry={() => void businessHours.refetch()}
      />
    );
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorMessage error={query.error} onRetry={() => void query.refetch()} />
    );
  return (
    <WeekForm
      initial={query.data}
      employee={Boolean(employeeId)}
      path={path}
      businessWeek={employeeId ? businessHours.data : undefined}
    />
  );
}
export function SchedulesPage() {
  const b = useOwnerBusiness();
  const employees = useEmployees(b.id);
  const [employeeId, setEmployeeId] = useState('');
  return (
    <>
      <h2>Horarios semanales</h2>
      <p>
        Los días desmarcados estarán cerrados. El horario del empleado debe
        quedar dentro de la apertura del negocio; el servidor comprobará los
        conflictos.
      </p>
      {employees.isPending ? (
        <Loading />
      ) : employees.error ? (
        <ErrorMessage error={employees.error} />
      ) : (
        <Select
          id="schedule-employee"
          label="Editar horario de"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          <option value="">Negocio</option>
          {employees.data.map((e) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}
              {e.active ? '' : ' (inactivo)'}
            </option>
          ))}
        </Select>
      )}
      {!b.active ? (
        <p>
          Los horarios no están disponibles mientras el negocio esté inactivo.
        </p>
      ) : employeeId &&
        !employees.data?.find((e) => e.id === employeeId)?.active ? (
        <p>
          Activa el empleado para consultar y editar su horario. Sus horarios
          existentes se conservan.
        </p>
      ) : (
        <WeekEditor key={employeeId} employeeId={employeeId} />
      )}
    </>
  );
}
