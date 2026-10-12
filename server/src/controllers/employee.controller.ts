import type { Request, RequestHandler } from 'express';
import type { EmployeeService } from '../services/employee.service.js';
import {
  employeeServiceParamsSchema,
  employeeIdParamSchema,
  businessIdParamSchema,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from '../schemas/employee.schema.js';
import { AppError } from '../utils/app-error.js';

function userId(req: Request) {
  if (!req.authUser) throw new AppError(401, 'Authentication required');
  return req.authUser.id;
}
export function createEmployeeController(service: EmployeeService) {
  const list: RequestHandler = async (req, res) => {
    const { businessId } = businessIdParamSchema.parse(req.params);
    res.json({ data: await service.listPublic(businessId) });
  };
  const manage: RequestHandler = async (req, res) => {
    const { businessId } = businessIdParamSchema.parse(req.params);
    res.json({ data: await service.listManaged(businessId, userId(req)) });
  };
  const get: RequestHandler = async (req, res) => {
    const { id } = employeeIdParamSchema.parse(req.params);
    res.json({ data: await service.getPublic(id) });
  };
  const create: RequestHandler = async (req, res) => {
    const { businessId } = businessIdParamSchema.parse(req.params);
    const data = await service.create(
      businessId,
      userId(req),
      req.body as CreateEmployeeInput,
    );
    res
      .status(201)
      .location('/api/employees/' + data.id)
      .json({ data });
  };
  const update: RequestHandler = async (req, res) => {
    const { id } = employeeIdParamSchema.parse(req.params);
    res.json({
      data: await service.update(
        id,
        userId(req),
        req.body as UpdateEmployeeInput,
      ),
    });
  };
  const deactivate: RequestHandler = async (req, res) => {
    const { id } = employeeIdParamSchema.parse(req.params);
    await service.deactivate(id, userId(req));
    res.status(204).end();
  };
  const listServices: RequestHandler = async (req, res) => {
    const { id } = employeeIdParamSchema.parse(req.params);
    res.json({ data: (await service.getPublic(id)).services });
  };
  const assignment =
    (assign: boolean): RequestHandler =>
    async (req, res) => {
      const { id, serviceId } = employeeServiceParamsSchema.parse(req.params);
      await service.changeAssignment(id, serviceId, userId(req), assign);
      res.status(204).end();
    };
  return {
    list,
    manage,
    get,
    create,
    update,
    deactivate,
    listServices,
    assign: assignment(true),
    unassign: assignment(false),
  };
}
