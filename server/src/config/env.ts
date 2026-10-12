import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AVAILABILITY_SLOT_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(15),
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value)),
});

const result = environmentSchema.safeParse(process.env);
if (!result.success) {
  // No imprimir valores: DATABASE_URL puede contener credenciales.
  throw new Error(
    `Invalid environment variables: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
  );
}
export const env = result.data;
