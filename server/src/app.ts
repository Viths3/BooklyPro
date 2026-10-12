import express, { type Router } from 'express';
import { createApiRouter } from './routes/index.js';
import type { DatabaseCheck } from './controllers/health.controller.js';
import { errorHandler } from './middleware/error-handler.js';
import { AppError } from './utils/app-error.js';

export function createApp(
  checkDatabase: DatabaseCheck,
  routers: {
    auth?: Router;
    businesses?: Router;
    services?: Router;
    employees?: Router;
    schedules?: Router;
    availability?: Router;
    appointments?: Router;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  if (routers.auth) app.use('/api/auth', routers.auth);
  if (routers.businesses) app.use('/api/businesses', routers.businesses);
  if (routers.services) app.use('/api', routers.services);
  if (routers.employees) app.use('/api', routers.employees);
  if (routers.schedules) app.use('/api', routers.schedules);
  if (routers.availability) app.use('/api', routers.availability);
  if (routers.appointments) app.use('/api', routers.appointments);
  app.use('/api', createApiRouter(checkDatabase));
  app.use((_req, _res, next) =>
    next(new AppError(404, 'Route not found', 'ROUTE_NOT_FOUND')),
  );
  app.use(errorHandler);
  return app;
}
