import { z } from 'zod';

const fields = {
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(5000).nullable().optional(),
  phone: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[+0-9() .-]+$/)
    .nullable()
    .optional(),
  address: z.string().trim().max(500).nullable().optional(),
  imageUrl: z
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    }, 'Use an HTTP(S) URL without credentials')
    .nullable()
    .optional(),
};
export const createBusinessSchema = z.strictObject(fields);
export const updateBusinessSchema = createBusinessSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field',
  );
export const businessIdParamSchema = z.strictObject({ id: z.uuid() });
const positiveInteger = (fallback: string, maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(maximum));
export const businessListQuerySchema = z.strictObject({
  page: positiveInteger('1', 10000),
  limit: positiveInteger('10', 100),
  search: z.string().trim().max(150).optional(),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type BusinessListQuery = z.infer<typeof businessListQuerySchema>;
