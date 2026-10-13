import { z } from 'zod';
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Introduce un correo válido.').max(254));
const password = z
  .string()
  .max(72, 'La contraseña es demasiado larga.')
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    'La contraseña no puede superar 72 bytes UTF-8.',
  );
export const loginSchema = z.object({
  email,
  password: password.refine(
    (value) => value.length > 0,
    'Introduce tu contraseña.',
  ),
});
export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Introduce tu nombre.').max(100),
  lastName: z.string().trim().min(1, 'Introduce tu apellido.').max(100),
  email,
  password: password.refine(
    (value) => value.length >= 12,
    'Usa al menos 12 caracteres.',
  ),
});
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export const userSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: z.enum(['CUSTOMER', 'BUSINESS_OWNER', 'ADMIN']),
});
export type User = z.infer<typeof userSchema>;
export const sessionSchema = z.object({
  data: z.object({
    user: userSchema,
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
});
