import { z } from 'zod';

export const createReviewSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => value || null)
    .optional(),
});
export const reviewIdParamSchema = z.strictObject({ id: z.uuid() });
export const appointmentIdParamSchema = z.strictObject({
  appointmentId: z.uuid(),
});
export const businessReviewsParamSchema = z.strictObject({
  businessId: z.uuid(),
});
export const businessReviewsQuerySchema = z.strictObject({
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
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type BusinessReviewsQuery = z.infer<typeof businessReviewsQuerySchema>;
