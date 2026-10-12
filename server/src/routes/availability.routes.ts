import { Router } from 'express';
import type { AvailabilityService } from '../services/availability.service.js';
import { createAvailabilityController } from '../controllers/availability.controller.js';
export function createAvailabilityRouter(service: AvailabilityService) {
  const router = Router();
  router.get(
    '/availability',
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
    createAvailabilityController(service),
  );
  return router;
}
