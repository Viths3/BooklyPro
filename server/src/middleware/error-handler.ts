import { ZodError } from 'zod';
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      },
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } });
    return;
  }
  if (error instanceof Error && 'status' in error && error.status === 413) {
    res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
    });
    return;
  }
  console.error('Unhandled request error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
};
