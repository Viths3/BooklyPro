import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type {
  CreateBusinessInput,
  UpdateBusinessInput,
  BusinessListQuery,
} from '../schemas/business.schema.js';

const businessSelect = {
  id: true,
  name: true,
  description: true,
  phone: true,
  address: true,
  imageUrl: true,
  active: true,
  timeZone: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BusinessSelect;

export class BusinessRepository {
  constructor(private readonly db: PrismaClient) {}
  create(ownerId: string, input: CreateBusinessInput) {
    return this.db.$transaction(async (tx) => {
      // Conditional update avoids downgrading ADMIN and serializes concurrent promotion.
      await tx.user.updateMany({
        where: { id: ownerId, role: 'CUSTOMER' },
        data: { role: 'BUSINESS_OWNER' },
      });
      return tx.business.create({
        data: { ...input, ownerId, active: true },
        select: businessSelect,
      });
    });
  }
  findOwnership(id: string) {
    return this.db.business.findUnique({
      where: { id },
      select: { ownerId: true },
    });
  }
  findActive(id: string) {
    return this.db.business.findFirst({
      where: { id, active: true },
      select: businessSelect,
    });
  }
  findOwned(ownerId: string) {
    return this.db.business.findMany({
      where: { ownerId },
      select: businessSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }
  update(id: string, ownerId: string, input: UpdateBusinessInput) {
    return this.db.business.update({
      where: { id, ownerId },
      data: input,
      select: businessSelect,
    });
  }
  deactivate(id: string, ownerId: string) {
    return this.db.business.updateMany({
      where: { id, ownerId, active: true },
      data: { active: false },
    });
  }
  list(query: BusinessListQuery) {
    // Treat LIKE metacharacters as literal name characters, not wildcards.
    const search = query.search?.replace(/[\\%_]/g, '\\$&');
    const where: Prisma.BusinessWhereInput = {
      active: true,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    const orderBy: Prisma.BusinessOrderByWithRelationInput[] = [
      { [query.sortBy]: query.order },
      { id: 'asc' },
    ];
    return this.db.$transaction(
      [
        this.db.business.findMany({
          where,
          select: businessSelect,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy,
        }),
        this.db.business.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
