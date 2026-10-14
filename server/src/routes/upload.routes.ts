import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthService } from '../services/auth.service.js';
import type { UploadService } from '../services/upload.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import { uploadSchema } from '../schemas/upload.schema.js';
import { createUploadController } from '../controllers/upload.controller.js';

export function createUploadRouter(service: UploadService, auth: AuthService) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/uploads/signature',
    authenticate(auth),
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 20,
      keyGenerator: (req) => req.authUser!.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many uploads. Try again later.',
        },
      },
    }),
    validateBody(uploadSchema),
    createUploadController(service),
  );
  return router;
}
