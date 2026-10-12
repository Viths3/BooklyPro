import type { RequestHandler } from 'express';

export type DatabaseCheck = () => Promise<void>;

export function createHealthController(
  checkDatabase: DatabaseCheck,
): RequestHandler {
  return async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await checkDatabase();
      res.json({
        status: 'ok',
        service: 'booklypro-api',
        database: 'connected',
      });
    } catch {
      res.status(503).json({
        status: 'error',
        service: 'booklypro-api',
        database: 'disconnected',
      });
    }
  };
}
