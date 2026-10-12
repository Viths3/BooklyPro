import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type {
  ScheduleInput,
  ScheduleKind,
} from '../schemas/schedule.schema.js';
const businessSelect = {
  dayOfWeek: true,
  openingTime: true,
  closingTime: true,
  active: true,
} satisfies Prisma.BusinessScheduleSelect;
const employeeSelect = {
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  active: true,
} satisfies Prisma.EmployeeScheduleSelect;
const businessRow = (
  s: Prisma.BusinessScheduleGetPayload<{ select: typeof businessSelect }>,
): ScheduleInput => ({
  dayOfWeek: s.dayOfWeek,
  start: s.openingTime,
  end: s.closingTime,
  active: s.active,
});
const employeeRow = (
  s: Prisma.EmployeeScheduleGetPayload<{ select: typeof employeeSelect }>,
): ScheduleInput => ({
  dayOfWeek: s.dayOfWeek,
  start: s.startTime,
  end: s.endTime,
  active: s.active,
});
export interface ScheduleWriteContext {
  business: { ownerId: string; active: boolean } | null;
  employee: { active: boolean } | null;
  week(kind: ScheduleKind, id: string): Promise<ScheduleInput[]>;
  employeeSchedules(): Promise<ScheduleInput[]>;
  replace(
    kind: ScheduleKind,
    id: string,
    schedules: ScheduleInput[],
  ): Promise<void>;
  update(
    kind: ScheduleKind,
    id: string,
    schedule: ScheduleInput,
  ): Promise<void>;
}
export class ScheduleRepository {
  constructor(private readonly db: PrismaClient) {}
  async findPublic(kind: ScheduleKind, id: string) {
    if (kind === 'business') {
      const entity = await this.db.business.findFirst({
        where: { id, active: true },
        select: { schedules: { select: businessSelect } },
      });
      return entity ? entity.schedules.map(businessRow) : null;
    }
    const entity = await this.db.employee.findFirst({
      where: { id, active: true, business: { active: true } },
      select: { schedules: { select: employeeSelect } },
    });
    return entity ? entity.schedules.map(employeeRow) : null;
  }
  findEmployeeBusiness(id: string) {
    return this.db.employee.findUnique({
      where: { id },
      select: { businessId: true },
    });
  }
  async withLockedBusiness<T>(
    businessId: string,
    employeeId: string | undefined,
    action: (context: ScheduleWriteContext) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      // All schedule writers share this lock, including different employees of the business.
      const rows = await tx.$queryRaw<
        { ownerId: string; active: boolean }[]
      >`SELECT "ownerId", active FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;
      const employee = employeeId
        ? await tx.employee.findFirst({
            where: { id: employeeId, businessId },
            select: { active: true },
          })
        : null;
      return action({
        business: rows[0] ?? null,
        employee,
        week: async (kind, id) =>
          kind === 'business'
            ? (
                await tx.businessSchedule.findMany({
                  where: { businessId: id },
                  select: businessSelect,
                })
              ).map(businessRow)
            : (
                await tx.employeeSchedule.findMany({
                  where: { employeeId: id },
                  select: employeeSelect,
                })
              ).map(employeeRow),
        employeeSchedules: async () =>
          (
            await tx.employeeSchedule.findMany({
              where: { employee: { businessId }, active: true },
              select: employeeSelect,
            })
          ).map(employeeRow),
        replace: async (kind, id, schedules) => {
          if (kind === 'business') {
            await tx.businessSchedule.deleteMany({ where: { businessId: id } });
            await tx.businessSchedule.createMany({
              data: schedules.map((s) => ({
                businessId: id,
                dayOfWeek: s.dayOfWeek,
                openingTime: s.start,
                closingTime: s.end,
                active: s.active,
              })),
            });
          } else {
            await tx.employeeSchedule.deleteMany({ where: { employeeId: id } });
            await tx.employeeSchedule.createMany({
              data: schedules.map((s) => ({
                employeeId: id,
                dayOfWeek: s.dayOfWeek,
                startTime: s.start,
                endTime: s.end,
                active: s.active,
              })),
            });
          }
        },
        update: async (kind, id, s) => {
          if (kind === 'business')
            await tx.businessSchedule.update({
              where: {
                businessId_dayOfWeek: {
                  businessId: id,
                  dayOfWeek: s.dayOfWeek,
                },
              },
              data: {
                openingTime: s.start,
                closingTime: s.end,
                active: s.active,
              },
            });
          else
            await tx.employeeSchedule.update({
              where: {
                employeeId_dayOfWeek: {
                  employeeId: id,
                  dayOfWeek: s.dayOfWeek,
                },
              },
              data: { startTime: s.start, endTime: s.end, active: s.active },
            });
        },
      });
    });
  }
}
