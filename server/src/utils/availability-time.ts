import { minutesToTime } from './time.js';
import { Temporal } from '@js-temporal/polyfill';
import type { DayOfWeek } from '../generated/prisma/enums.js';
import { weekDays } from '../schemas/schedule.schema.js';
export interface BusyInterval {
  startTime: Date;
  endTime: Date;
}

export function dayOfWeek(date: string): DayOfWeek {
  return weekDays[Temporal.PlainDate.from(date).dayOfWeek - 1]!;
}
export function localDate(now: Date, timeZone: string) {
  return Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}
export function dayBounds(date: string, timeZone: string) {
  const day = Temporal.PlainDate.from(date);
  return {
    start: new Date(day.toZonedDateTime(timeZone).epochMilliseconds),
    end: new Date(
      day.add({ days: 1 }).toZonedDateTime(timeZone).epochMilliseconds,
    ),
  };
}
export function hasOverlap(start: number, end: number, busy: BusyInterval) {
  return start < busy.endTime.getTime() && end > busy.startTime.getTime();
}
export interface SlotOptions {
  date: string;
  timeZone: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  intervalMinutes: number;
  now: Date;
  appointments: BusyInterval[];
}
export function generateTimeSlots(options: SlotOptions) {
  const {
    date,
    timeZone,
    startMinutes,
    endMinutes,
    durationMinutes,
    intervalMinutes,
    now,
    appointments,
  } = options;
  if (
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < 1 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1
  )
    throw new RangeError(
      'Slot interval and duration must be positive integers',
    );
  const midnight = Temporal.PlainDate.from(date).toPlainDateTime();
  const slots: { startTime: string; endTime: string }[] = [];
  for (
    let start = startMinutes;
    start + durationMinutes <= endMinutes;
    start += intervalMinutes
  ) {
    const end = start + durationMinutes;
    let startInstant: number;
    let endInstant: number;
    try {
      // The HH:mm response cannot distinguish repeated wall times: omit ambiguous/nonexistent endpoints.
      startInstant = midnight
        .add({ minutes: start })
        .toZonedDateTime(timeZone, {
          disambiguation: 'reject',
        }).epochMilliseconds;
      endInstant = midnight.add({ minutes: end }).toZonedDateTime(timeZone, {
        disambiguation: 'reject',
      }).epochMilliseconds;
    } catch (error) {
      if (error instanceof RangeError) continue;
      throw error;
    }
    if (
      endInstant - startInstant !== durationMinutes * 60_000 ||
      startInstant < now.getTime()
    )
      continue;
    if (appointments.some((busy) => hasOverlap(startInstant, endInstant, busy)))
      continue;
    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
    });
  }
  return slots;
}
