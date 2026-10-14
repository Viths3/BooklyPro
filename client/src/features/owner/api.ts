import { z } from 'zod';
import type { SessionManager } from '../auth/session';
import { statuses } from '../appointments/api';

export const businessSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  imageUrl: z.string().nullable(),
  active: z.boolean(),
  timeZone: z.string(),
  currency: z.string(),
});
export const serviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.string(),
  durationMinutes: z.number(),
  active: z.boolean(),
});
export const employeeSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  active: z.boolean(),
  services: z.array(serviceSchema),
});
export type Business = z.infer<typeof businessSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export const days = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export const dayLabels = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];
export const businessDaySchema = z.object({
  dayOfWeek: z.enum(days),
  active: z.boolean(),
  openingTime: z.string(),
  closingTime: z.string(),
});
export const employeeDaySchema = z.object({
  dayOfWeek: z.enum(days),
  active: z.boolean(),
  startTime: z.string(),
  endTime: z.string(),
});
export const ownerAppointmentSchema = z.object({
  id: z.string(),
  status: z.enum(statuses),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  priceAtBooking: z.string(),
  notes: z.string().nullable(),
  customer: z.object({ firstName: z.string(), lastName: z.string() }),
  employee: z.object({ firstName: z.string(), lastName: z.string() }),
  service: z.object({ name: z.string() }),
});
export type OwnerAppointment = z.infer<typeof ownerAppointmentSchema>;
export async function readList<T>(
  session: SessionManager,
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  return z
    .object({ data: z.array(schema) })
    .parse(await session.request(path, { signal })).data;
}
export const ownerKeys = {
  mine: (user: string) => ['owner', user, 'mine'] as const,
  section: (user: string, business: string, section: string, entity = '') =>
    ['owner', user, business, section, entity] as const,
  appointments: (
    user: string,
    business: string,
    filters: Record<string, string>,
  ) => ['appointments', user, 'business', business, filters] as const,
};
export async function readAppointments(
  session: SessionManager,
  business: string,
  filters: Record<string, string>,
  signal?: AbortSignal,
) {
  return z
    .object({
      data: z.array(ownerAppointmentSchema),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      }),
    })
    .parse(
      await session.request(
        `/api/businesses/${business}/appointments?${new URLSearchParams(filters)}`,
        { signal },
      ),
    );
}
