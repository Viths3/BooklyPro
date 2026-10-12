import type { Role } from '../generated/prisma/enums.js';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}
declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthUser;
  }
}
