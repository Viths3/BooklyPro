import type {
  AppointmentRepository,
  AppointmentRecord,
} from '../repositories/appointment.repository.js';
import type { AvailabilityService } from './availability.service.js';
import type {
  CreateAppointmentInput,
  AppointmentListQuery,
} from '../schemas/appointment.schema.js';
import type { AppointmentStatus } from '../generated/prisma/enums.js';
import { AppError } from '../utils/app-error.js';
import { assertBusinessOwner } from '../utils/business-access.js';
import { assertAppointmentTransition } from '../utils/appointment-status.js';
import {
  slotUnavailable,
  mapAppointmentWriteError,
} from '../utils/appointment-errors.js';
import { dayBounds, localTimeToInstant } from '../utils/availability-time.js';
import { timeToMinutes } from '../utils/time.js';
function response(row: AppointmentRecord) {
  const { business, ...appointment } = row;
  return {
    ...appointment,
    priceAtBooking: row.priceAtBooking.toFixed(2),
    service: { ...row.service, price: row.service.price.toFixed(2) },
    business: {
      id: business.id,
      name: business.name,
      timeZone: business.timeZone,
    },
  };
}
function requireAppointment(
  row: AppointmentRecord | null,
): asserts row is AppointmentRecord {
  if (!row)
    throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
}
function range(query: AppointmentListQuery) {
  return {
    ...(query.from ? { gte: new Date(query.from) } : {}),
    ...(query.to ? { lt: new Date(query.to) } : {}),
  };
}
export class AppointmentService {
  constructor(
    private readonly repository: AppointmentRepository,
    private readonly availability: AvailabilityService,
  ) {}
  async create(customerId: string, input: CreateAppointmentInput) {
    try {
      return await this.repository.withCreationLock(
        input.businessId,
        async (context) => {
          const { date, businessId, serviceId, employeeId } = input;
          const evaluated = await this.availability.evaluate(
            context.availability,
            { date, businessId, serviceId, employeeId },
          );
          const slot = evaluated.data.slots.find(
            (slot) => slot.startTime === input.startTime,
          );
          if (!slot) throw slotUnavailable();
          return response(
            await context.create({
              customerId,
              businessId,
              serviceId,
              employeeId,
              notes: input.notes,
              startTime: localTimeToInstant(
                date,
                timeToMinutes(slot.startTime),
                evaluated.timeZone,
              ),
              endTime: localTimeToInstant(
                date,
                timeToMinutes(slot.endTime),
                evaluated.timeZone,
              ),
              priceAtBooking: evaluated.price,
            }),
          );
        },
      );
    } catch (error) {
      mapAppointmentWriteError(error);
    }
  }
  async get(id: string, userId: string) {
    const row = await this.repository.find(id);
    requireAppointment(row);
    if (row.customerId !== userId && row.business.ownerId !== userId)
      throw new AppError(403, 'You cannot view this appointment');
    return response(row);
  }
  async listMine(userId: string, query: AppointmentListQuery) {
    return this.list(
      { customerId: userId, status: query.status, startTime: range(query) },
      query,
    );
  }
  async listBusiness(
    businessId: string,
    userId: string,
    query: AppointmentListQuery,
  ) {
    const business = await this.repository.findBusiness(businessId);
    assertBusinessOwner(business, userId);
    let startTime = range(query);
    if (query.date) {
      try {
        const bounds = dayBounds(query.date, business.timeZone);
        startTime = { gte: bounds.start, lt: bounds.end };
      } catch {
        throw new AppError(
          409,
          'Business time zone is invalid',
          'INVALID_BUSINESS_TIMEZONE',
        );
      }
    }
    return this.list(
      {
        businessId,
        status: query.status,
        employeeId: query.employeeId,
        serviceId: query.serviceId,
        startTime,
      },
      query,
    );
  }
  private async list(
    where: Parameters<AppointmentRepository['list']>[0],
    query: AppointmentListQuery,
  ) {
    const [rows, total] = await this.repository.list(where, query);
    return {
      data: rows.map(response),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
  async cancel(id: string, userId: string) {
    return this.repository.withAppointmentLock(id, async (context) => {
      const row = context.appointment;
      requireAppointment(row);
      if (row.customerId !== userId)
        throw new AppError(
          403,
          'Only the customer can cancel through this endpoint',
        );
      if (row.status === 'CANCELLED') return response(row);
      assertAppointmentTransition(row.status, 'CANCELLED');
      return response(await context.update('CANCELLED'));
    });
  }
  async updateStatus(id: string, userId: string, status: AppointmentStatus) {
    return this.repository.withAppointmentLock(id, async (context) => {
      const row = context.appointment;
      requireAppointment(row);
      assertBusinessOwner(row.business, userId);
      if (row.status === 'CONFIRMED' && status === 'CONFIRMED')
        return response(row);
      assertAppointmentTransition(row.status, status);
      return response(await context.update(status));
    });
  }
}
