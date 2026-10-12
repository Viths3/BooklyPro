import { minutesToTime as time } from '../utils/time.js';
import type { ScheduleRepository } from '../repositories/schedule.repository.js';
import {
  weekDays,
  type ScheduleInput,
  type ScheduleKind,
  type SchedulePatch,
} from '../schemas/schedule.schema.js';
import type { DayOfWeek } from '../generated/prisma/enums.js';
import { assertBusinessOwner } from '../utils/business-access.js';
import { AppError } from '../utils/app-error.js';

function response(kind: ScheduleKind, schedules: ScheduleInput[]) {
  return [...schedules]
    .sort(
      (a, b) => weekDays.indexOf(a.dayOfWeek) - weekDays.indexOf(b.dayOfWeek),
    )
    .map((s) => ({
      dayOfWeek: s.dayOfWeek,
      ...(kind === 'business'
        ? { openingTime: time(s.start), closingTime: time(s.end) }
        : { startTime: time(s.start), endTime: time(s.end) }),
      active: s.active,
    }));
}
function compatible(business: ScheduleInput[], employees: ScheduleInput[]) {
  return employees.every(
    (s) =>
      !s.active ||
      business.some(
        (b) =>
          b.dayOfWeek === s.dayOfWeek &&
          b.active &&
          b.start <= s.start &&
          b.end >= s.end,
      ),
  );
}
export class ScheduleService {
  constructor(private readonly repository: ScheduleRepository) {}
  async getPublic(kind: ScheduleKind, id: string) {
    const schedules = await this.repository.findPublic(kind, id);
    if (!schedules)
      throw new AppError(
        404,
        kind === 'business' ? 'Business not found' : 'Employee not found',
      );
    return response(kind, schedules);
  }
  async save(
    kind: ScheduleKind,
    id: string,
    userId: string,
    change:
      | { schedules: ScheduleInput[] }
      | { dayOfWeek: DayOfWeek; patch: SchedulePatch },
  ) {
    let businessId = id;
    if (kind === 'employee') {
      const employee = await this.repository.findEmployeeBusiness(id);
      if (!employee)
        throw new AppError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
      businessId = employee.businessId;
    }
    return this.repository.withLockedBusiness(
      businessId,
      kind === 'employee' ? id : undefined,
      async (context) => {
        assertBusinessOwner(context.business, userId);
        if (!context.business.active)
          throw new AppError(409, 'Business is inactive', 'BUSINESS_INACTIVE');
        if (kind === 'employee' && !context.employee)
          throw new AppError(404, 'Employee not found', 'EMPLOYEE_NOT_FOUND');
        // Inactive employees can have their schedules corrected before reactivation.
        let schedules: ScheduleInput[];
        let updated: ScheduleInput | undefined;
        if ('schedules' in change) schedules = change.schedules;
        else {
          schedules = await context.week(kind, id);
          const current = schedules.find(
            (s) => s.dayOfWeek === change.dayOfWeek,
          );
          if (!current)
            throw new AppError(
              404,
              'Schedule day not configured; use PUT first',
            );
          updated = { ...current, ...change.patch };
          if (updated.active && updated.start >= updated.end)
            throw new AppError(
              400,
              'Start time must precede end time for an active day',
            );
          schedules = schedules.map((s) =>
            s.dayOfWeek === updated!.dayOfWeek ? updated! : s,
          );
        }
        const business =
          kind === 'business'
            ? schedules
            : await context.week('business', businessId);
        const employees =
          kind === 'employee' ? schedules : await context.employeeSchedules();
        if (!compatible(business, employees))
          throw new AppError(
            409,
            kind === 'business'
              ? 'Business schedule conflicts with existing employee schedules'
              : 'Employee schedule must fit within an active business schedule',
          );
        if (updated) await context.update(kind, id, updated);
        else await context.replace(kind, id, schedules);
        return response(kind, schedules);
      },
    );
  }
}
