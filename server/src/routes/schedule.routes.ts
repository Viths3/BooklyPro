import { Router } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { ScheduleService } from '../services/schedule.service.js';
import { createScheduleController } from '../controllers/schedule.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import {
  businessSchedulesSchema,
  employeeSchedulesSchema,
  businessSchedulePatchSchema,
  employeeSchedulePatchSchema,
} from '../schemas/schedule.schema.js';
export function createScheduleRouter(
  service: ScheduleService,
  auth: AuthService,
) {
  const router = Router();
  const authenticated = authenticate(auth);
  const business = createScheduleController(service, 'business');
  const employee = createScheduleController(service, 'employee');
  const businessPath = '/businesses/:businessId/schedules';
  const employeePath = '/employees/:employeeId/schedules';
  router.use([businessPath, employeePath], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get(businessPath, business.get);
  router.put(
    businessPath,
    authenticated,
    validateBody(businessSchedulesSchema),
    business.put,
  );
  router.patch(
    businessPath + '/:dayOfWeek',
    authenticated,
    validateBody(businessSchedulePatchSchema),
    business.patch,
  );
  router.get(employeePath, employee.get);
  router.put(
    employeePath,
    authenticated,
    validateBody(employeeSchedulesSchema),
    employee.put,
  );
  router.patch(
    employeePath + '/:dayOfWeek',
    authenticated,
    validateBody(employeeSchedulePatchSchema),
    employee.patch,
  );
  return router;
}
