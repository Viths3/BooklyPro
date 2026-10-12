import { Router } from 'express';
import {
  createHealthController,
  type DatabaseCheck,
} from '../controllers/health.controller.js';

export function createApiRouter(checkDatabase: DatabaseCheck) {
  const router = Router();
  router.get('/health', createHealthController(checkDatabase));
  return router;
}
