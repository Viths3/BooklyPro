import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z
  .string()
  .min(12)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must not exceed 72 UTF-8 bytes',
  );
export const registerSchema = z.strictObject({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email,
  password,
});
export const loginSchema = z.strictObject({
  email,
  password: z
    .string()
    .min(1)
    .max(72)
    .refine(
      (value) => Buffer.byteLength(value, 'utf8') <= 72,
      'Password must not exceed 72 UTF-8 bytes',
    ),
});
export const refreshSchema = z.strictObject({
  refreshToken: z.string().min(1).max(4096),
});
export type RegisterInput = z.infer<typeof registerSchema>;
