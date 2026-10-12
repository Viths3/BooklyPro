import express, { type Router } from 'express';
import { createApiRouter } from './routes/index.js';
import type { DatabaseCheck } from './controllers/health.controller.js';
import { errorHandler } from './middleware/error-handler.js';
import { AppError } from './utils/app-error.js';

export function createApp(checkDatabase: DatabaseCheck, authRouter?: Router) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  if (authRouter) app.use('/api/auth', authRouter);
  app.use('/api', createApiRouter(checkDatabase));
  app.use((_req, _res, next) => next(new AppError(404, 'Route not found')));
  app.use(errorHandler);
  return app;
}
