import type { Request, RequestHandler } from 'express';
import type { ServiceService } from '../services/service.service.js';
import {
  serviceIdParamSchema,
  serviceBusinessParamSchema,
  type CreateServiceInput,
  type UpdateServiceInput,
} from '../schemas/service.schema.js';
import { AppError } from '../utils/app-error.js';

function userId(req: Request) {
  if (!req.authUser) throw new AppError(401, 'Authentication required');
  return req.authUser.id;
}
export function createServiceController(service: ServiceService) {
  const list: RequestHandler = async (req, res) => {
    const { businessId } = serviceBusinessParamSchema.parse(req.params);
    res.json({ data: await service.listPublic(businessId) });
  };
  const manage: RequestHandler = async (req, res) => {
    const { businessId } = serviceBusinessParamSchema.parse(req.params);
    res.json({ data: await service.listManaged(businessId, userId(req)) });
  };
  const get: RequestHandler = async (req, res) => {
    const { id } = serviceIdParamSchema.parse(req.params);
    res.json({ data: await service.getPublic(id) });
  };
  const create: RequestHandler = async (req, res) => {
    const { businessId } = serviceBusinessParamSchema.parse(req.params);
    const data = await service.create(
      businessId,
      userId(req),
      req.body as CreateServiceInput,
    );
    res
      .status(201)
      .location('/api/services/' + data.id)
      .json({ data });
  };
  const update: RequestHandler = async (req, res) => {
    const { id } = serviceIdParamSchema.parse(req.params);
    res.json({
      data: await service.update(
        id,
        userId(req),
        req.body as UpdateServiceInput,
      ),
    });
  };
  const deactivate: RequestHandler = async (req, res) => {
    const { id } = serviceIdParamSchema.parse(req.params);
    await service.deactivate(id, userId(req));
    res.status(204).end();
  };
  return { list, manage, get, create, update, deactivate };
}
