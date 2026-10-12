import type { RequestHandler } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { AppError } from '../utils/app-error.js';
import '../types/auth.js';

export function authorizeRoles(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.authUser)
      return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.authUser.role))
      return next(new AppError(403, 'Insufficient permissions'));
    next();
  };
}
