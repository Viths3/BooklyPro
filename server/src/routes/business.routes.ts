import { Router } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { BusinessService } from '../services/business.service.js';
import { createBusinessController } from '../controllers/business.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import {
  createBusinessSchema,
  updateBusinessSchema,
} from '../schemas/business.schema.js';

export function createBusinessRouter(
  service: BusinessService,
  auth: AuthService,
) {
  const router = Router();
  const controller = createBusinessController(service);
  const authenticated = authenticate(auth);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/', controller.list);
  // Static route must precede /:id.
  router.get('/me', authenticated, controller.me);
  router.get('/:id', controller.get);
  router.post(
    '/',
    authenticated,
    validateBody(createBusinessSchema),
    controller.create,
  );
  router.patch(
    '/:id',
    authenticated,
    validateBody(updateBusinessSchema),
    controller.update,
  );
  router.delete('/:id', authenticated, controller.deactivate);
  return router;
}
