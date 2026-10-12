import { z } from 'zod';
import { AppointmentStatus } from '../generated/prisma/enums.js';
import { availabilityQuerySchema } from './availability.schema.js';
export const createAppointmentSchema = availabilityQuerySchema.extend({
  startTime: z
    .string()
    .regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'),
  notes: z.string().trim().max(500).optional(),
});
export const appointmentIdParamSchema = z.strictObject({ id: z.uuid() });
export const appointmentBusinessParamSchema = z.strictObject({
  businessId: z.uuid(),
});
export const updateAppointmentStatusSchema = z.strictObject({
  status: z.enum(AppointmentStatus),
});
export const cancelAppointmentSchema = z.strictObject({}).optional();
const pagination = z.strictObject({
  status: z.enum(AppointmentStatus).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  page: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(z.number().int().max(1000000))
    .default(1),
  limit: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(z.number().int().max(100))
    .default(20),
});
const validRange = (q: { from?: string; to?: string }) =>
  !q.from || !q.to || Date.parse(q.from) < Date.parse(q.to);
export const customerAppointmentsQuerySchema = pagination.refine(
  validRange,
  'from must precede to',
);
export const businessAppointmentsQuerySchema = pagination
  .extend({
    date: availabilityQuerySchema.shape.date.optional(),
    employeeId: z.uuid().optional(),
    serviceId: z.uuid().optional(),
  })
  .refine(validRange, 'from must precede to')
  .refine(
    (q) => !q.date || (!q.from && !q.to),
    'Use date or from/to, not both',
  );
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type AppointmentListQuery = z.infer<
  typeof businessAppointmentsQuerySchema
>;
