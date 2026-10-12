import { z } from 'zod';
export const createEmployeeSchema = z.strictObject({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(254))
    .nullable()
    .optional(),
  phone: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[+0-9() .-]+$/)
    .nullable()
    .optional(),
});
export const updateEmployeeSchema = createEmployeeSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field',
  );
export const employeeIdParamSchema = z.strictObject({ id: z.uuid() });
export const employeeServiceParamsSchema = z.strictObject({
  id: z.uuid(),
  serviceId: z.uuid(),
});
export const businessIdParamSchema = z.strictObject({ businessId: z.uuid() });
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
