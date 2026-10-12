import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { AppointmentStatus } from '../generated/prisma/enums.js';
import {
  createAvailabilityReader,
  type AvailabilityReader,
} from './availability.repository.js';
import type { AppointmentListQuery } from '../schemas/appointment.schema.js';
const select = {
  id: true,
  customerId: true,
  businessId: true,
  employeeId: true,
  serviceId: true,
  startTime: true,
  endTime: true,
  status: true,
  notes: true,
  priceAtBooking: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, firstName: true, lastName: true } },
  employee: { select: { id: true, firstName: true, lastName: true } },
  service: {
    select: { id: true, name: true, price: true, durationMinutes: true },
  },
  business: { select: { id: true, name: true, timeZone: true, ownerId: true } },
} satisfies Prisma.AppointmentSelect;
export type AppointmentRecord = Prisma.AppointmentGetPayload<{
  select: typeof select;
}>;
type NewAppointment = Pick<
  Prisma.AppointmentUncheckedCreateInput,
  | 'customerId'
  | 'businessId'
  | 'employeeId'
  | 'serviceId'
  | 'startTime'
  | 'endTime'
  | 'priceAtBooking'
  | 'notes'
>;
export class AppointmentRepository {
  constructor(private readonly db: PrismaClient) {}
  withCreationLock<T>(
    businessId: string,
    action: (context: {
      availability: AvailabilityReader;
      create(data: NewAppointment): Promise<AppointmentRecord>;
    }) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        // Shared with schedule, employee and service writers; use READ COMMITTED after acquiring lock.
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId}::uuid FOR UPDATE`;
        return action({
          availability: createAvailabilityReader(tx),
          create: (data) =>
            tx.appointment.create({
              data: { ...data, status: 'PENDING' },
              select,
            }),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
  find(id: string) {
    return this.db.appointment.findUnique({ where: { id }, select });
  }
  withAppointmentLock<T>(
    id: string,
    action: (context: {
      appointment: AppointmentRecord | null;
      update(status: AppointmentStatus): Promise<AppointmentRecord>;
    }) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${id}::uuid FOR UPDATE`;
      return action({
        appointment: await tx.appointment.findUnique({ where: { id }, select }),
        update: (status) =>
          tx.appointment.update({ where: { id }, data: { status }, select }),
      });
    });
  }
  findBusiness(id: string) {
    return this.db.business.findUnique({
      where: { id },
      select: { ownerId: true, timeZone: true },
    });
  }
  list(where: Prisma.AppointmentWhereInput, query: AppointmentListQuery) {
    return this.db.$transaction(
      [
        this.db.appointment.findMany({
          where,
          select,
          orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.appointment.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
