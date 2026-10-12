import type { AvailabilityRepository } from '../repositories/availability.repository.js';
import type { AvailabilityQuery } from '../schemas/availability.schema.js';
import {
  dayOfWeek,
  dayBounds,
  generateTimeSlots,
  localDate,
} from '../utils/availability-time.js';
import { AppError } from '../utils/app-error.js';
export class AvailabilityService {
  constructor(
    private readonly repository: AvailabilityRepository,
    private readonly intervalMinutes = 15,
    private readonly clock: () => Date = () => new Date(),
  ) {
    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < 1 ||
      intervalMinutes > 1440
    )
      throw new RangeError('Invalid slot interval');
  }
  get(query: AvailabilityQuery) {
    const now = this.clock();
    const day = dayOfWeek(query.date);
    return this.repository.read(async (context) => {
      const business = await context.business(query.businessId, day);
      if (!business?.active) throw new AppError(404, 'Business not found');
      let today: string;
      let bounds: ReturnType<typeof dayBounds>;
      try {
        today = localDate(now, business.timeZone);
        bounds = dayBounds(query.date, business.timeZone);
      } catch {
        throw new AppError(409, 'Business time zone is invalid');
      }
      if (query.date < today)
        throw new AppError(400, 'Date must not be in the past');
      const service = await context.service(query.serviceId);
      if (!service?.active) throw new AppError(404, 'Service not found');
      if (service.businessId !== query.businessId)
        throw new AppError(400, 'Service does not belong to this business');
      const employee = await context.employee(
        query.employeeId,
        day,
        query.serviceId,
      );
      if (!employee?.active) throw new AppError(404, 'Employee not found');
      if (employee.businessId !== query.businessId)
        throw new AppError(400, 'Employee does not belong to this business');
      if (!employee.services.length)
        throw new AppError(400, 'Employee does not offer this service');
      const result = {
        ...query,
        durationMinutes: service.durationMinutes,
        slots: [] as { startTime: string; endTime: string }[],
      };
      const businessSchedule = business.schedules[0];
      const employeeSchedule = employee.schedules[0];
      if (!businessSchedule?.active || !employeeSchedule?.active) return result;
      if (
        businessSchedule.openingTime > employeeSchedule.startTime ||
        employeeSchedule.endTime > businessSchedule.closingTime
      )
        throw new AppError(409, 'Employee schedule is outside business hours');
      const appointments = await context.appointments(
        query.employeeId,
        bounds.start,
        bounds.end,
      );
      result.slots = generateTimeSlots({
        date: query.date,
        timeZone: business.timeZone,
        startMinutes: employeeSchedule.startTime,
        endMinutes: employeeSchedule.endTime,
        durationMinutes: service.durationMinutes,
        intervalMinutes: this.intervalMinutes,
        now,
        appointments,
      });
      return result;
    });
  }
}
