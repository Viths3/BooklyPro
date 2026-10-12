import { Router } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { EmployeeService } from '../services/employee.service.js';
import { createEmployeeController } from '../controllers/employee.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from '../schemas/employee.schema.js';

export function createEmployeeRouter(
  service: EmployeeService,
  auth: AuthService,
) {
  const router = Router();
  const controller = createEmployeeController(service);
  const authenticated = authenticate(auth);
  router.use(
    ['/businesses/:businessId/employees', '/employees'],
    (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  router.get('/businesses/:businessId/employees', controller.list);
  router.get(
    '/businesses/:businessId/employees/manage',
    authenticated,
    controller.manage,
  );
  router.get('/employees/:id', controller.get);
  router.post(
    '/businesses/:businessId/employees',
    authenticated,
    validateBody(createEmployeeSchema),
    controller.create,
  );
  router.patch(
    '/employees/:id',
    authenticated,
    validateBody(updateEmployeeSchema),
    controller.update,
  );
  router.delete('/employees/:id', authenticated, controller.deactivate);
  router.get('/employees/:id/services', controller.listServices);
  router.post(
    '/employees/:id/services/:serviceId',
    authenticated,
    controller.assign,
  );
  router.delete(
    '/employees/:id/services/:serviceId',
    authenticated,
    controller.unassign,
  );
  return router;
}
