import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { DayOfWeek } from '../generated/prisma/enums.js';
export function createAvailabilityReader(tx: Prisma.TransactionClient) {
  return {
    business: (id: string, dayOfWeek: DayOfWeek) =>
      tx.business.findUnique({
        where: { id },
        select: {
          active: true,
          timeZone: true,
          schedules: {
            where: { dayOfWeek },
            select: { openingTime: true, closingTime: true, active: true },
          },
        },
      }),
    service: (id: string) =>
      tx.service.findUnique({
        where: { id },
        select: {
          businessId: true,
          active: true,
          durationMinutes: true,
          price: true,
        },
      }),
    employee: (id: string, dayOfWeek: DayOfWeek, serviceId: string) =>
      tx.employee.findUnique({
        where: { id },
        select: {
          businessId: true,
          active: true,
          services: { where: { serviceId }, select: { serviceId: true } },
          schedules: {
            where: { dayOfWeek },
            select: { startTime: true, endTime: true, active: true },
          },
        },
      }),
    appointments: (employeeId: string, start: Date, end: Date) =>
      tx.appointment.findMany({
        where: {
          employeeId,
          status: { in: ['PENDING', 'CONFIRMED'] },
          startTime: { lt: end },
          endTime: { gt: start },
        },
        select: { startTime: true, endTime: true },
        orderBy: { startTime: 'asc' },
      }),
  };
}
export class AvailabilityRepository {
  constructor(private readonly db: PrismaClient) {}
  read<T>(
    action: (
      context: ReturnType<typeof createAvailabilityReader>,
    ) => Promise<T>,
  ): Promise<T> {
    // Consistent read snapshot; this endpoint does not reserve or lock slots.
    return this.db.$transaction((tx) => action(createAvailabilityReader(tx)), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }
}

export type AvailabilityReader = ReturnType<typeof createAvailabilityReader>;
