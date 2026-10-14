import { z } from 'zod';

const origins = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(
      z.url().refine((value) => {
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) && url.origin === value
        );
      }, 'Use an exact HTTP(S) origin without a path or trailing slash'),
    ),
  );

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value)),
    CORS_ORIGINS: origins.optional(),
    CLOUDINARY_CLOUD_NAME: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .optional()
      .or(z.literal('')),
    CLOUDINARY_API_KEY: z.string().regex(/^\d+$/).optional().or(z.literal('')),
    CLOUDINARY_API_SECRET: z.string().optional(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    AVAILABILITY_SLOT_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1440)
      .default(15),
  })
  .superRefine((value, context) => {
    const cloudinary = [
      value.CLOUDINARY_CLOUD_NAME,
      value.CLOUDINARY_API_KEY,
      value.CLOUDINARY_API_SECRET,
    ];
    if (cloudinary.some(Boolean) && !cloudinary.every(Boolean)) {
      context.addIssue({
        code: 'custom',
        path: ['CLOUDINARY'],
        message: 'Configure all three Cloudinary variables or omit all of them',
      });
    }
    if (value.NODE_ENV === 'production' && value.PORT === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['PORT'],
        message: 'PORT is required in production',
      });
    }
  })
  .transform((value) => ({
    ...value,
    PORT: value.PORT ?? 3000,
    CORS_ORIGINS:
      value.CORS_ORIGINS ??
      (value.NODE_ENV === 'development' ? ['http://localhost:5173'] : []),
  }));
