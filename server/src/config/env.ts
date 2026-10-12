import 'dotenv/config';
import { environmentSchema } from './environment-schema.js';

const result = environmentSchema.safeParse(process.env);
if (!result.success) {
  // No imprimir valores: DATABASE_URL puede contener credenciales.
  throw new Error(
    `Invalid environment variables: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
  );
}
export const env = result.data;
