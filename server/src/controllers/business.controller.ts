import type { Request, RequestHandler } from 'express';
import type { BusinessService } from '../services/business.service.js';
import {
  businessIdParamSchema,
  businessListQuerySchema,
  type CreateBusinessInput,
  type UpdateBusinessInput,
} from '../schemas/business.schema.js';
import { AppError } from '../utils/app-error.js';

function userId(req: Request): string {
  if (!req.authUser) throw new AppError(401, 'Authentication required');
  return req.authUser.id;
}
export function createBusinessController(service: BusinessService) {
  const list: RequestHandler = async (req, res) => {
    res.json(await service.list(businessListQuerySchema.parse(req.query)));
  };
  const get: RequestHandler = async (req, res) => {
    const { id } = businessIdParamSchema.parse(req.params);
    res.json({ data: await service.getActive(id) });
  };
  const me: RequestHandler = async (req, res) => {
    res.json({ data: await service.getOwned(userId(req)) });
  };
  const create: RequestHandler = async (req, res) => {
    const data = await service.create(
      userId(req),
      req.body as CreateBusinessInput,
    );
    res
      .status(201)
      .location('/api/businesses/' + data.id)
      .json({ data });
  };
  const update: RequestHandler = async (req, res) => {
    const { id } = businessIdParamSchema.parse(req.params);
    res.json({
      data: await service.update(
        id,
        userId(req),
        req.body as UpdateBusinessInput,
      ),
    });
  };
  const deactivate: RequestHandler = async (req, res) => {
    const { id } = businessIdParamSchema.parse(req.params);
    await service.deactivate(id, userId(req));
    res.status(204).end();
  };
  return { list, get, me, create, update, deactivate };
}
