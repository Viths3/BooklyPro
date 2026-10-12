import { Router } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { ServiceService } from '../services/service.service.js';
import { createServiceController } from '../controllers/service.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import {
  createServiceSchema,
  updateServiceSchema,
} from '../schemas/service.schema.js';

export function createServiceRouter(
  service: ServiceService,
  auth: AuthService,
) {
  const router = Router();
  const controller = createServiceController(service);
  const authenticated = authenticate(auth);
  router.use(
    ['/businesses/:businessId/services', '/services'],
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  router.get('/businesses/:businessId/services', controller.list);
  router.get(
    '/businesses/:businessId/services/manage',
    authenticated,
    controller.manage,
  );
  router.get('/services/:id', controller.get);
  router.post(
    '/businesses/:businessId/services',
    authenticated,
    validateBody(createServiceSchema),
    controller.create,
  );
  router.patch(
    '/services/:id',
    authenticated,
    validateBody(updateServiceSchema),
    controller.update,
  );
  router.delete('/services/:id', authenticated, controller.deactivate);
  return router;
}
