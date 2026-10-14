import { z } from 'zod';
import type { SessionManager } from '../features/auth/session';
import { ApiError } from './client';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export class ImageUploadError extends Error {}
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export function validateImage(file: File) {
  if (!IMAGE_TYPES.includes(file.type))
    throw new Error(
      'Elige una imagen JPEG, PNG o WebP. SVG no está permitido.',
    );
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error('La imagen debe pesar entre 1 byte y 5 MB.');
}
const authorization = z.object({
  data: z.object({
    cloudName: z.string().regex(/^[a-z0-9_-]+$/),
    apiKey: z.string(),
    signature: z.string(),
    params: z.record(z.string(), z.string()),
    expiresAt: z.number(),
  }),
});

export async function uploadBusinessImage(
  session: SessionManager,
  file: File,
  signal: AbortSignal,
  businessId?: string,
) {
  validateImage(file);
  let signed: z.infer<typeof authorization>['data'];
  try {
    signed = authorization.parse(
      await session.request('/api/uploads/signature', {
        method: 'POST',
        signal,
        body: {
          context: 'business',
          contentType: file.type,
          size: file.size,
          ...(businessId ? { businessId } : {}),
        },
      }),
    ).data;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof ApiError && error.code === 'UPLOADS_UNAVAILABLE')
      throw new ImageUploadError(
        'La carga de imágenes todavía no está configurada.',
        { cause: error },
      );
    throw new ImageUploadError(
      'No pudimos autorizar la carga. Revisa tu sesión y vuelve a intentarlo.',
      { cause: error },
    );
  }
  signal.throwIfAborted();
  if (Date.now() >= signed.expiresAt * 1000)
    throw new ImageUploadError(
      'La autorización caducó. Vuelve a seleccionar la imagen.',
    );
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', signed.apiKey);
  body.append('signature', signed.signature);
  for (const [key, value] of Object.entries(signed.params))
    body.append(key, value);
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`,
      {
        method: 'POST',
        body,
        credentials: 'omit',
        signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
      },
    );
    if (!response.ok) throw new Error('provider rejected upload');
    const result = z
      .object({
        secure_url: z.url(),
        public_id: z.string(),
        resource_type: z.literal('image'),
        format: z.enum(['jpg', 'png', 'webp']),
        bytes: z.number().positive().max(MAX_IMAGE_BYTES),
      })
      .parse(await response.json());
    const url = new URL(result.secure_url);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'res.cloudinary.com' ||
      !url.pathname.startsWith(`/${signed.cloudName}/image/upload/`) ||
      url.username ||
      url.password ||
      result.public_id !== signed.params.public_id
    )
      throw new Error('invalid asset');
    return result.secure_url.replace(
      '/image/upload/',
      '/image/upload/f_auto,q_auto,c_limit,w_1600,h_1600/',
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ImageUploadError(
      'No pudimos subir la imagen. Comprueba tu conexión e inténtalo de nuevo.',
      { cause: error },
    );
  }
}
