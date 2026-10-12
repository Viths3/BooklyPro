import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { AuthRepository } from '../repositories/auth.repository.js';
import type { RegisterInput } from '../schemas/auth.schema.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { hashToken, issueTokens, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../utils/app-error.js';
import { authConfig } from '../config/auth.js';
import type { AuthUser } from '../types/auth.js';

function publicUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  };
}
function sessionResponse(
  user: AuthUser,
  tokens: ReturnType<typeof issueTokens>,
) {
  return {
    user: publicUser(user),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: 'Bearer',
    expiresIn: authConfig.JWT_ACCESS_EXPIRES_IN,
  };
}
function storedToken(tokens: ReturnType<typeof issueTokens>) {
  return {
    id: tokens.id,
    tokenHash: hashToken(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
  };
}
export class AuthService {
  constructor(private readonly repository: AuthRepository) {}
  async register(input: RegisterInput) {
    if (await this.repository.findByEmail(input.email))
      throw new AppError(
        409,
        'Email already registered',
        'EMAIL_ALREADY_REGISTERED',
      );
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.repository.createCustomer({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new AppError(
          409,
          'Email already registered',
          'EMAIL_ALREADY_REGISTERED',
        );
      throw error;
    }
  }
  async login(email: string, password: string) {
    const user = await this.repository.findByEmail(email);
    const matches = await comparePassword(password, user?.passwordHash);
    if (!user || !matches) throw new AppError(401, 'Invalid email or password');
    const tokens = issueTokens(user);
    await this.repository.createSession(
      user.id,
      randomUUID(),
      storedToken(tokens),
    );
    return sessionResponse(user, tokens);
  }
  async refresh(token: string) {
    const claims = verifyRefreshToken(token);
    const user = await this.repository.findPublicUser(claims.sub);
    if (!user) throw new AppError(401, 'Invalid or expired refresh token');
    const tokens = issueTokens(user);
    const rotated = await this.repository.rotateSession(
      user.id,
      claims.jti,
      hashToken(token),
      storedToken(tokens),
    );
    if (!rotated) throw new AppError(401, 'Invalid or expired refresh token');
    return sessionResponse(user, tokens);
  }
  async logout(token: string) {
    const claims = verifyRefreshToken(token);
    await this.repository.revokeSession(
      claims.sub,
      claims.jti,
      hashToken(token),
    );
  }
  async getUser(id: string) {
    const user = await this.repository.findPublicUser(id);
    if (!user) throw new AppError(401, 'Invalid or expired access token');
    return user;
  }
}
