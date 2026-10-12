import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type {
  CreateServiceInput,
  UpdateServiceInput,
} from '../schemas/service.schema.js';

export const serviceSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  durationMinutes: true,
  active: true,
} satisfies Prisma.ServiceSelect;
export type ServiceRecord = Prisma.ServiceGetPayload<{
  select: typeof serviceSelect;
}>;
type BusinessAccess = { ownerId: string; active: boolean };
interface ServiceWriteContext {
  business: BusinessAccess | null;
  create(input: CreateServiceInput): Promise<ServiceRecord>;
  update(id: string, input: UpdateServiceInput): Promise<ServiceRecord>;
  deactivate(id: string): Promise<void>;
}
export class ServiceRepository {
  constructor(private readonly db: PrismaClient) {}
  findBusinessCatalog(businessId: string, onlyActive: boolean) {
    return this.db.business.findFirst({
      where: { id: businessId, ...(onlyActive ? { active: true } : {}) },
      select: {
        ownerId: true,
        active: true,
        services: {
          where: onlyActive ? { active: true } : {},
          select: serviceSelect,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }
  findActive(id: string) {
    return this.db.service.findFirst({
      where: { id, active: true, business: { active: true } },
      select: serviceSelect,
    });
  }
  findBusinessId(id: string) {
    return this.db.service.findUnique({
      where: { id },
      select: { businessId: true },
    });
  }
  async withLockedBusiness<T>(
    businessId: string,
    action: (context: ServiceWriteContext) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      // A business deactivation must serialize with service creation/reactivation.
      const rows = await tx.$queryRaw<
        BusinessAccess[]
      >`SELECT "ownerId", active FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;
      return action({
        business: rows[0] ?? null,
        create: (input) =>
          tx.service.create({
            data: {
              ...input,
              price: new Prisma.Decimal(input.price),
              businessId,
              active: true,
            },
            select: serviceSelect,
          }),
        update: (id, input) =>
          tx.service.update({
            where: { id, businessId },
            data: {
              ...input,
              ...(input.price !== undefined
                ? { price: new Prisma.Decimal(input.price) }
                : {}),
            },
            select: serviceSelect,
          }),
        deactivate: async (id) => {
          await tx.service.updateMany({
            where: { id, businessId, active: true },
            data: { active: false },
          });
        },
      });
    });
  }
}
