import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
export type DatabaseCheck = () => Promise<void>;
export function createHealthController(
  checkDatabase: DatabaseCheck,
): RequestHandler {
  return async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await checkDatabase();
    } catch {
      throw new AppError(
        503,
        'Database is unavailable',
        'DATABASE_UNAVAILABLE',
      );
    }
    res.json({
      data: { status: 'ok', service: 'booklypro-api', database: 'connected' },
    });
  };
}
