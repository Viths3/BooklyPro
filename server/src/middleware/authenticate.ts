import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/app-error.js';
import type { AuthService } from '../services/auth.service.js';
import '../types/auth.js';

export function authenticate(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const match = header?.match(/^Bearer ([^\s]+)$/i);
    if (!match?.[1] || match[1].length > 4096)
      throw new AppError(401, 'Authentication required');
    const claims = verifyAccessToken(match[1]);
    req.authUser = await auth.getUser(claims.sub);
    next();
  };
}
