import { z } from 'zod';

export interface ApiResponse<T> {
  data: T;
}
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}
const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
  }),
});
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const base =
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? 'http://localhost:3000' : '');
  if (!URL.canParse(base) || !/^https?:\/\//.test(base))
    throw new ApiError(
      0,
      'CONFIGURATION_ERROR',
      'Configura VITE_API_URL para conectar con BooklyPro.',
    );
  if (!path.startsWith('/api/'))
    throw new Error('API paths must start with /api/');
  let response: Response;
  try {
    response = await fetch(base.replace(/\/+$/, '') + path, {
      method: options.method ?? 'GET',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    if (parsed.success)
      throw new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    throw new ApiError(
      response.status,
      'SERVER_ERROR',
      'El servicio no está disponible. Inténtalo de nuevo.',
    );
  }
  if (body === null)
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'No pudimos leer la respuesta del servicio.',
    );
  return body as T;
}
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      UNAUTHORIZED:
        'No pudimos validar tu sesión. Comprueba tus credenciales o vuelve a iniciar sesión.',
      EMAIL_ALREADY_REGISTERED: 'Ya existe una cuenta con ese correo.',
      RATE_LIMITED:
        'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
      FORBIDDEN: 'No tienes permiso para acceder a esta información.',
      CONFLICT:
        'No se pudo aplicar el cambio. Comprueba que el negocio y los elementos relacionados estén activos y que el estado no haya cambiado.',
      BUSINESS_NOT_FOUND: 'Este negocio no está disponible.',
      APPOINTMENT_NOT_FOUND: 'Esta cita no está disponible.',
      INVALID_APPOINTMENT_STATUS_TRANSITION:
        'El estado de esta cita cambió y ya no permite esta acción. Actualiza el detalle.',
      APPOINTMENT_NOT_REVIEWABLE: 'Solo puedes reseñar una cita completada.',
      REVIEW_ALREADY_EXISTS: 'Ya dejaste una reseña para esta cita.',
      BUSINESS_INACTIVE: 'Este negocio ya no acepta reservas.',
      SERVICE_NOT_FOUND:
        'Este servicio ya no está disponible. Elige otro servicio.',
      SERVICE_INACTIVE:
        'Este servicio ya no está disponible. Elige otro servicio.',
      EMPLOYEE_NOT_FOUND:
        'Este profesional ya no está disponible. Elige otro profesional.',
      EMPLOYEE_INACTIVE:
        'Este profesional ya no está disponible. Elige otro profesional.',
      SERVICE_NOT_ASSIGNED_TO_EMPLOYEE:
        'Este profesional ya no realiza el servicio. Vuelve atrás y elige otro.',
      APPOINTMENT_SLOT_UNAVAILABLE:
        'Este horario acaba de ser reservado. Elige otro horario.',
      INVALID_DATE: 'La fecha ya pasó en el negocio. Elige otra fecha.',
      INVALID_APPOINTMENT_DATA:
        'Las selecciones de la reserva no coinciden. Revisa el servicio y el profesional.',
      VALIDATION_ERROR: 'Revisa los datos del formulario.',
    };
    return messages[error.code] ?? error.message;
  }
  return 'Ocurrió un problema. Inténtalo de nuevo.';
}
