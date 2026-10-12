import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { serviceSelect } from './service.repository.js';
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from '../schemas/employee.schema.js';
const publicSelect = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.EmployeeSelect;
const serviceOrder = [
  { service: { name: 'asc' as const } },
  { serviceId: 'asc' as const },
];
export class EmployeeRepository {
  constructor(private readonly db: PrismaClient) {}
  findPublicBusiness(businessId: string) {
    return this.db.business.findFirst({
      where: { id: businessId, active: true },
      select: {
        employees: {
          where: { active: true },
          select: publicSelect,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }
  findManagedBusiness(businessId: string) {
    return this.db.business.findUnique({
      where: { id: businessId },
      select: {
        ownerId: true,
        employees: {
          include: {
            services: {
              select: { service: { select: serviceSelect } },
              orderBy: serviceOrder,
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }
  findActive(id: string) {
    return this.db.employee.findFirst({
      where: { id, active: true, business: { active: true } },
      select: {
        ...publicSelect,
        services: {
          where: { service: { active: true } },
          select: { service: { select: serviceSelect } },
          orderBy: serviceOrder,
        },
      },
    });
  }
  findBusinessId(id: string) {
    return this.db.employee.findUnique({
      where: { id },
      select: { businessId: true },
    });
  }
  async withLockedBusiness<T>(
    businessId: string,
    action: (context: EmployeeWriteContext) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      // Serialize with business, service and employee state changes in the API.
      const rows = await tx.$queryRaw<
        { ownerId: string; active: boolean }[]
      >`SELECT "ownerId", active FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;
      return action({
        business: rows[0] ?? null,
        findEmployee: (id: string) =>
          tx.employee.findFirst({ where: { id, businessId } }),
        findService: (id: string) =>
          tx.service.findUnique({
            where: { id },
            select: { businessId: true, active: true },
          }),
        create: (input: CreateEmployeeInput) =>
          tx.employee.create({ data: { ...input, businessId, active: true } }),
        update: (id: string, input: UpdateEmployeeInput) =>
          tx.employee.update({ where: { id, businessId }, data: input }),
        deactivate: async (id: string) => {
          await tx.employee.updateMany({
            where: { id, businessId, active: true },
            data: { active: false },
          });
        },
        assign: async (employeeId: string, serviceId: string) =>
          (
            await tx.employeeService.createMany({
              data: { employeeId, serviceId, businessId },
              skipDuplicates: true,
            })
          ).count,
        unassign: async (employeeId: string, serviceId: string) => {
          await tx.employeeService.deleteMany({
            where: { employeeId, serviceId, businessId },
          });
        },
      });
    });
  }
}
export interface EmployeeWriteContext {
  business: { ownerId: string; active: boolean } | null;
  findEmployee(id: string): Promise<Prisma.EmployeeGetPayload<object> | null>;
  findService(
    id: string,
  ): Promise<{ businessId: string; active: boolean } | null>;
  create(
    input: CreateEmployeeInput,
  ): Promise<Prisma.EmployeeGetPayload<object>>;
  update(
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<Prisma.EmployeeGetPayload<object>>;
  deactivate(id: string): Promise<void>;
  assign(employeeId: string, serviceId: string): Promise<number>;
  unassign(employeeId: string, serviceId: string): Promise<void>;
}
