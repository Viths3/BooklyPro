import { Router } from 'express';
import type { ReviewService } from '../services/review.service.js';
import type { AuthService } from '../services/auth.service.js';
import { createReviewController } from '../controllers/review.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import { createReviewSchema } from '../schemas/review.schema.js';

export function createReviewRouter(service: ReviewService, auth: AuthService) {
  const router = Router();
  const controller = createReviewController(service);
  router.post(
    '/appointments/:appointmentId/review',
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
    authenticate(auth),
    validateBody(createReviewSchema),
    controller.create,
  );
  router.get('/businesses/:businessId/reviews', controller.list);
  router.get('/reviews/:id', controller.get);
  return router;
}
