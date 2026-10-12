import type { RequestHandler } from 'express';
import type { AvailabilityService } from '../services/availability.service.js';
import { availabilityQuerySchema } from '../schemas/availability.schema.js';
export function createAvailabilityController(
  service: AvailabilityService,
): RequestHandler {
  return async (req, res) => {
    res.json({
      data: await service.get(availabilityQuerySchema.parse(req.query)),
    });
  };
}
