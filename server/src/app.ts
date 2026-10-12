import express from 'express';
import { apiRouter } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { AppError } from './utils/app-error.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiRouter);
app.use((_req, _res, next) => next(new AppError(404, 'Route not found')));
app.use(errorHandler);
