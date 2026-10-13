import type { RequestHandler } from 'express';
import type { ReviewService } from '../services/review.service.js';
import {
  appointmentIdParamSchema,
  reviewIdParamSchema,
  businessReviewsParamSchema,
  businessReviewsQuerySchema,
  type CreateReviewInput,
} from '../schemas/review.schema.js';
import { AppError } from '../utils/app-error.js';

export function createReviewController(service: ReviewService) {
  const create: RequestHandler = async (req, res) => {
    if (!req.authUser) throw new AppError(401, 'Authentication required');
    const { appointmentId } = appointmentIdParamSchema.parse(req.params);
    const data = await service.create(
      appointmentId,
      req.authUser.id,
      req.body as CreateReviewInput,
    );
    res
      .status(201)
      .location('/api/reviews/' + data.id)
      .json({ data });
  };
  const get: RequestHandler = async (req, res) => {
    const { id } = reviewIdParamSchema.parse(req.params);
    res.json({ data: await service.get(id) });
  };
  const list: RequestHandler = async (req, res) => {
    const { businessId } = businessReviewsParamSchema.parse(req.params);
    res.json(
      await service.list(
        businessId,
        businessReviewsQuerySchema.parse(req.query),
      ),
    );
  };
  return { create, get, list };
}
