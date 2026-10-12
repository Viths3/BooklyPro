import type { Request, RequestHandler } from 'express';
import type { AppointmentService } from '../services/appointment.service.js';
import {
  appointmentIdParamSchema,
  appointmentBusinessParamSchema,
  customerAppointmentsQuerySchema,
  businessAppointmentsQuerySchema,
  type CreateAppointmentInput,
  updateAppointmentStatusSchema,
} from '../schemas/appointment.schema.js';
import { AppError } from '../utils/app-error.js';
function userId(req: Request) {
  if (!req.authUser) throw new AppError(401, 'Authentication required');
  return req.authUser.id;
}
export function createAppointmentController(service: AppointmentService) {
  const create: RequestHandler = async (req, res) => {
    const data = await service.create(
      userId(req),
      req.body as CreateAppointmentInput,
    );
    res
      .status(201)
      .location('/api/appointments/' + data.id)
      .json({ data });
  };
  const me: RequestHandler = async (req, res) => {
    res.json(
      await service.listMine(
        userId(req),
        customerAppointmentsQuerySchema.parse(req.query),
      ),
    );
  };
  const business: RequestHandler = async (req, res) => {
    const { businessId } = appointmentBusinessParamSchema.parse(req.params);
    res.json(
      await service.listBusiness(
        businessId,
        userId(req),
        businessAppointmentsQuerySchema.parse(req.query),
      ),
    );
  };
  const get: RequestHandler = async (req, res) => {
    const { id } = appointmentIdParamSchema.parse(req.params);
    res.json({ data: await service.get(id, userId(req)) });
  };
  const cancel: RequestHandler = async (req, res) => {
    const { id } = appointmentIdParamSchema.parse(req.params);
    res.json({ data: await service.cancel(id, userId(req)) });
  };
  const status: RequestHandler = async (req, res) => {
    const { id } = appointmentIdParamSchema.parse(req.params);
    const { status } = updateAppointmentStatusSchema.parse(req.body);
    res.json({ data: await service.updateStatus(id, userId(req), status) });
  };
  return { create, me, business, get, cancel, status };
}
