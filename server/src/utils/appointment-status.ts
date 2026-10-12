import type { AppointmentStatus } from '../generated/prisma/enums.js';
import { AppError } from './app-error.js';
export const allowedTransitions: Record<
  AppointmentStatus,
  readonly AppointmentStatus[]
> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
export function assertAppointmentTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
) {
  if (!allowedTransitions[from].includes(to))
    throw new AppError(
      409,
      'Cannot change appointment status from ' + from + ' to ' + to,
      'INVALID_APPOINTMENT_STATUS_TRANSITION',
    );
}
