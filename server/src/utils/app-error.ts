const defaultCodes: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = defaultCodes[statusCode] ?? 'INTERNAL_SERVER_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
