import { Router } from 'express';
import type { AppointmentService } from '../services/appointment.service.js';
import type { AuthService } from '../services/auth.service.js';
import { createAppointmentController } from '../controllers/appointment.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import {
  createAppointmentSchema,
  cancelAppointmentSchema,
} from '../schemas/appointment.schema.js';
export function createAppointmentRouter(
  service: AppointmentService,
  auth: AuthService,
) {
  const router = Router();
  const controller = createAppointmentController(service);
  router.use(
    ['/appointments', '/businesses/:businessId/appointments'],
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
    authenticate(auth),
  );
  router.post(
    '/appointments',
    validateBody(createAppointmentSchema),
    controller.create,
  );
  router.get('/appointments/me', controller.me);
  router.get('/appointments/:id', controller.get);
  router.patch(
    '/appointments/:id/cancel',
    validateBody(cancelAppointmentSchema),
    controller.cancel,
  );
  router.patch('/appointments/:id/status', controller.status);
  router.get('/businesses/:businessId/appointments', controller.business);
  return router;
}
