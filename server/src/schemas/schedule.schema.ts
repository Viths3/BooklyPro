import { timeToMinutes as minutes } from '../utils/time.js';
import { z } from 'zod';
import { DayOfWeek } from '../generated/prisma/enums.js';
export const weekDays = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export type ScheduleKind = 'business' | 'employee';
export interface ScheduleInput {
  dayOfWeek: DayOfWeek;
  start: number;
  end: number;
  active: boolean;
}
export type SchedulePatch = Partial<Omit<ScheduleInput, 'dayOfWeek'>>;
const day = z.enum(DayOfWeek);
const time = z
  .string()
  .regex(
    /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/,
    'Use HH:mm between 00:00 and 23:59',
  );

const businessFields = z.strictObject({
  openingTime: time,
  closingTime: time,
  active: z.boolean(),
});
const employeeFields = z.strictObject({
  startTime: time,
  endTime: time,
  active: z.boolean(),
});
export const businessScheduleSchema = businessFields
  .extend({ dayOfWeek: day })
  .refine(
    (s) => !s.active || s.openingTime < s.closingTime,
    'Opening time must precede closing time for an active day',
  )
  .transform((s) => ({
    dayOfWeek: s.dayOfWeek,
    start: minutes(s.openingTime),
    end: minutes(s.closingTime),
    active: s.active,
  }));
export const employeeScheduleSchema = employeeFields
  .extend({ dayOfWeek: day })
  .refine(
    (s) => !s.active || s.startTime < s.endTime,
    'Start time must precede end time for an active day',
  )
  .transform((s) => ({
    dayOfWeek: s.dayOfWeek,
    start: minutes(s.startTime),
    end: minutes(s.endTime),
    active: s.active,
  }));
const uniqueDays = (schedules: ScheduleInput[]) =>
  new Set(schedules.map((s) => s.dayOfWeek)).size === schedules.length;
export const businessSchedulesSchema = z.strictObject({
  schedules: z
    .array(businessScheduleSchema)
    .max(7)
    .refine(uniqueDays, 'Duplicate days are not allowed'),
});
export const employeeSchedulesSchema = z.strictObject({
  schedules: z
    .array(employeeScheduleSchema)
    .max(7)
    .refine(uniqueDays, 'Duplicate days are not allowed'),
});
export const businessSchedulePatchSchema = businessFields
  .partial()
  .refine((s) => Object.keys(s).length > 0, 'Provide at least one field')
  .transform((s) => ({
    ...(s.openingTime !== undefined ? { start: minutes(s.openingTime) } : {}),
    ...(s.closingTime !== undefined ? { end: minutes(s.closingTime) } : {}),
    ...(s.active !== undefined ? { active: s.active } : {}),
  }));
export const employeeSchedulePatchSchema = employeeFields
  .partial()
  .refine((s) => Object.keys(s).length > 0, 'Provide at least one field')
  .transform((s) => ({
    ...(s.startTime !== undefined ? { start: minutes(s.startTime) } : {}),
    ...(s.endTime !== undefined ? { end: minutes(s.endTime) } : {}),
    ...(s.active !== undefined ? { active: s.active } : {}),
  }));
export const businessScheduleParamsSchema = z.strictObject({
  businessId: z.uuid(),
});
export const employeeScheduleParamsSchema = z.strictObject({
  employeeId: z.uuid(),
});
export const dayOfWeekParamSchema = z.strictObject({ dayOfWeek: day });
export const businessScheduleDayParamsSchema =
  businessScheduleParamsSchema.extend(dayOfWeekParamSchema.shape);
export const employeeScheduleDayParamsSchema =
  employeeScheduleParamsSchema.extend(dayOfWeekParamSchema.shape);
