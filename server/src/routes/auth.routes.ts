import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthService } from '../services/auth.service.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from '../schemas/auth.schema.js';

export function createAuthRouter(auth: AuthService) {
  const router = Router();
  const controller = createAuthController(auth);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const attempts = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts. Try again later.' } },
  });
  const sessions = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts. Try again later.' } },
  });
  router.post(
    '/register',
    attempts,
    validateBody(registerSchema),
    controller.register,
  );
  router.post('/login', attempts, validateBody(loginSchema), controller.login);
  router.post(
    '/refresh',
    sessions,
    validateBody(refreshSchema),
    controller.refresh,
  );
  router.post(
    '/logout',
    sessions,
    validateBody(refreshSchema),
    controller.logout,
  );
  router.get('/me', authenticate(auth), controller.me);
  return router;
}
