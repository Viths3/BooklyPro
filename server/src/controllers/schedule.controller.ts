import type { Request, RequestHandler } from 'express';
import type { ScheduleService } from '../services/schedule.service.js';
import {
  businessScheduleParamsSchema,
  employeeScheduleParamsSchema,
  businessScheduleDayParamsSchema,
  employeeScheduleDayParamsSchema,
  type ScheduleInput,
  type SchedulePatch,
  type ScheduleKind,
} from '../schemas/schedule.schema.js';
import { AppError } from '../utils/app-error.js';
function userId(req: Request) {
  if (!req.authUser) throw new AppError(401, 'Authentication required');
  return req.authUser.id;
}
export function createScheduleController(
  service: ScheduleService,
  kind: ScheduleKind,
) {
  const entityId = (req: Request) =>
    kind === 'business'
      ? businessScheduleParamsSchema.parse(req.params).businessId
      : employeeScheduleParamsSchema.parse(req.params).employeeId;
  const get: RequestHandler = async (req, res) => {
    res.json({ data: await service.getPublic(kind, entityId(req)) });
  };
  const put: RequestHandler = async (req, res) => {
    res.json({
      data: await service.save(
        kind,
        entityId(req),
        userId(req),
        req.body as { schedules: ScheduleInput[] },
      ),
    });
  };
  const patch: RequestHandler = async (req, res) => {
    const params =
      kind === 'business'
        ? businessScheduleDayParamsSchema.parse(req.params)
        : employeeScheduleDayParamsSchema.parse(req.params);
    const id = 'businessId' in params ? params.businessId : params.employeeId;
    res.json({
      data: await service.save(kind, id, userId(req), {
        dayOfWeek: params.dayOfWeek,
        patch: req.body as SchedulePatch,
      }),
    });
  };
  return { get, put, patch };
}
