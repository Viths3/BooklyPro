import type { RequestHandler } from 'express';
import type { UploadService } from '../services/upload.service.js';
import type { UploadInput } from '../schemas/upload.schema.js';
import { AppError } from '../utils/app-error.js';

export function createUploadController(service: UploadService): RequestHandler {
  return async (req, res) => {
    if (!req.authUser) throw new AppError(401, 'Authentication required');
    res.json({
      data: await service.sign(req.authUser.id, req.body as UploadInput),
    });
  };
}
