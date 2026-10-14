import { z } from 'zod';

export const uploadSchema = z.strictObject({
  context: z.literal('business'),
  businessId: z.uuid().optional(),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export type UploadInput = z.infer<typeof uploadSchema>;
