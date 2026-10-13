import { z } from 'zod';
import type { SessionManager } from '../auth/session';
export const statuses = [
  'PENDING',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type Status = (typeof statuses)[number];
export const statusLabels: Record<Status, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No asistió',
};
const appointmentSchema = z.object({
  id: z.string(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  status: z.enum(statuses),
  notes: z.string().nullable(),
  business: z.object({
    id: z.string(),
    name: z.string(),
    timeZone: z.string(),
  }),
  service: z.object({ name: z.string() }),
  employee: z.object({ firstName: z.string(), lastName: z.string() }),
});
const detailSchema = appointmentSchema.extend({
  hasReview: z.boolean(),
  customerId: z.string(),
});
export type Appointment = z.infer<typeof appointmentSchema>;
export type AppointmentDetail = z.infer<typeof detailSchema>;
export type Filters = {
  status?: Status;
  page?: number;
  limit?: number;
  from?: string;
};
const listSchema = z.object({
  data: z.array(appointmentSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});
export const reviewSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, 'Selecciona una valoración de 1 a 5.')
    .max(5, 'Selecciona una valoración de 1 a 5.'),
  comment: z.string().trim().max(1000, 'Usa como máximo 1000 caracteres.'),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
export const appointmentsApi = {
  async list(session: SessionManager, filters: Filters, signal?: AbortSignal) {
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    );
    return listSchema.parse(
      await session.request(`/api/appointments/me?${params}`, { signal }),
    );
  },
  async detail(session: SessionManager, id: string, signal?: AbortSignal) {
    return z.object({ data: detailSchema }).parse(
      await session.request(`/api/appointments/${encodeURIComponent(id)}`, {
        signal,
      }),
    ).data;
  },
  async cancel(session: SessionManager, id: string) {
    return z
      .object({ data: appointmentSchema })
      .parse(
        await session.request(
          `/api/appointments/${encodeURIComponent(id)}/cancel`,
          { method: 'PATCH' },
        ),
      ).data;
  },
  review(session: SessionManager, id: string, input: ReviewInput) {
    return session.request(
      `/api/appointments/${encodeURIComponent(id)}/review`,
      { method: 'POST', body: input },
    );
  },
};
export function isUpcoming(appointment: Appointment, now: number) {
  return (
    ['PENDING', 'CONFIRMED'].includes(appointment.status) &&
    Date.parse(appointment.startTime) >= now
  );
}
export function appointmentDate(
  instant: string,
  timeZone: string,
  kind: 'date' | 'time',
) {
  return new Intl.DateTimeFormat('es', {
    timeZone,
    ...(kind === 'date'
      ? { dateStyle: 'medium' as const }
      : { timeStyle: 'short' as const }),
  }).format(new Date(instant));
}
