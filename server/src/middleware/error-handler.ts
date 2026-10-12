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
        message: 'Invalid request data',
        fields: [
          ...new Set(
            error.issues.map((issue) => issue.path.join('.') || 'body'),
          ),
        ],
      },
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: { message: error.message } });
    return;
  }
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    res.status(400).json({ error: { message: 'Invalid JSON body' } });
    return;
  }
  if (error instanceof Error && 'status' in error && error.status === 413) {
    res.status(413).json({ error: { message: 'Request body too large' } });
    return;
  }
  console.error('Unhandled request error');
  res.status(500).json({ error: { message: 'Internal server error' } });
};
