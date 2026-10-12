import { z } from 'zod';

// Decimal(12,2): ten integer digits and at most two fractional digits.
// Convert a JSON number to text without performing floating point arithmetic.
const price = z
  .union([z.string(), z.number().finite()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/,
        'Price must be between 0 and 9999999999.99 with at most two decimal places',
      ),
  );
export const createServiceSchema = z.strictObject({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).nullable().optional(),
  price,
  durationMinutes: z.number().int().min(1).max(1440),
});
export const updateServiceSchema = createServiceSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field',
  );
export const serviceIdParamSchema = z.strictObject({ id: z.uuid() });
export const serviceBusinessParamSchema = z.strictObject({
  businessId: z.uuid(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
