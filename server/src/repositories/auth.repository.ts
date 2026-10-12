import type { PrismaClient, Prisma } from '../generated/prisma/client.js';

export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;
export interface SessionRecord {
  id: string;
  tokenHash: string;
  expiresAt: Date;
}

export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}
  findByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }
  findPublicUser(id: string) {
    return this.db.user.findUnique({ where: { id }, select: publicUserSelect });
  }
  createCustomer(data: {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
  }) {
    return this.db.user.create({
      data: { ...data, role: 'CUSTOMER' },
      select: publicUserSelect,
    });
  }
  createSession(userId: string, familyId: string, record: SessionRecord) {
    return this.db.refreshToken.create({
      data: { ...record, userId, familyId },
    });
  }
  async rotateSession(
    userId: string,
    id: string,
    tokenHash: string,
    replacement: SessionRecord,
  ) {
    return this.db.$transaction(async (tx) => {
      // Serialize rotation/revocation per user, including concurrent replay/logout.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const session = await tx.refreshToken.findUnique({
        where: { tokenHash },
      });
      if (!session || session.id !== id || session.userId !== userId)
        return false;
      if (session.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { userId, familyId: session.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        // Return instead of throwing: revocation must commit on replay.
        return false;
      }
      const now = new Date();
      if (session.expiresAt <= now) return false;
      await tx.refreshToken.update({ where: { id }, data: { revokedAt: now } });
      await tx.refreshToken.create({
        data: { ...replacement, userId, familyId: session.familyId },
      });
      return true;
    });
  }
  async revokeSession(userId: string, id: string, tokenHash: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
      const session = await tx.refreshToken.findUnique({
        where: { tokenHash },
      });
      if (!session || session.id !== id || session.userId !== userId) return;
      await tx.refreshToken.updateMany({
        where: { userId, familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
