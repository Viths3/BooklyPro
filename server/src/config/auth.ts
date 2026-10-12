import { z } from 'zod';
import './env.js';

const duration = z
  .string()
  .regex(/^[1-9]\d{0,5}[smhd]$/)
  .transform((value) => {
    const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return Number(value.slice(0, -1)) * (units[value.slice(-1)] ?? 0);
  });
const schema = z
  .object({
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: duration
      .default(900)
      .pipe(z.number().int().min(1).max(3600)),
    JWT_REFRESH_EXPIRES_IN: duration.default(604800).pipe(
      z
        .number()
        .int()
        .min(1)
        .max(30 * 86400),
    ),
  })
  .refine((value) => value.JWT_ACCESS_SECRET !== value.JWT_REFRESH_SECRET, {
    path: ['JWT_REFRESH_SECRET'],
    message: 'Use distinct secrets',
  });
const result = schema.safeParse(process.env);
if (!result.success) {
  throw new Error(
    'Invalid authentication environment: ' +
      result.error.issues.map((issue) => issue.path.join('.')).join(', '),
  );
}
export const authConfig = result.data;
