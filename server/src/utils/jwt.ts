import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authConfig } from '../config/auth.js';
import type { Role } from '../generated/prisma/enums.js';
import { AppError } from './app-error.js';

const issuer = 'booklypro-api';
const accessClaims = z.object({
  sub: z.uuid(),
  role: z.enum(['CUSTOMER', 'BUSINESS_OWNER', 'ADMIN']),
  type: z.literal('access'),
  exp: z.number().int(),
  iat: z.number().int(),
});
const refreshClaims = z.object({
  sub: z.uuid(),
  jti: z.uuid(),
  type: z.literal('refresh'),
  exp: z.number().int(),
  iat: z.number().int(),
});

export function issueTokens(user: { id: string; role: Role }) {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((now + authConfig.JWT_REFRESH_EXPIRES_IN) * 1000);
  const accessToken = jwt.sign(
    { role: user.role, type: 'access', iat: now },
    authConfig.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS256',
      subject: user.id,
      issuer,
      audience: 'booklypro-access',
      expiresIn: authConfig.JWT_ACCESS_EXPIRES_IN,
    },
  );
  const refreshToken = jwt.sign(
    { type: 'refresh', iat: now },
    authConfig.JWT_REFRESH_SECRET,
    {
      algorithm: 'HS256',
      subject: user.id,
      jwtid: id,
      issuer,
      audience: 'booklypro-refresh',
      expiresIn: authConfig.JWT_REFRESH_EXPIRES_IN,
    },
  );
  return { id, expiresAt, accessToken, refreshToken };
}
export function verifyAccessToken(token: string) {
  try {
    return accessClaims.parse(
      jwt.verify(token, authConfig.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer,
        audience: 'booklypro-access',
      }),
    );
  } catch {
    throw new AppError(401, 'Invalid or expired access token');
  }
}
export function verifyRefreshToken(token: string) {
  try {
    return refreshClaims.parse(
      jwt.verify(token, authConfig.JWT_REFRESH_SECRET, {
        algorithms: ['HS256'],
        issuer,
        audience: 'booklypro-refresh',
      }),
    );
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token');
  }
}
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
