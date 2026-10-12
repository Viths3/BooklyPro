import { z } from 'zod';
export const availabilityQuerySchema = z.strictObject({
  businessId: z.uuid(),
  serviceId: z.uuid(),
  employeeId: z.uuid(),
  date: z.iso
    .date()
    .refine((date) => !date.startsWith('0000-'), 'Year must be positive'),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
