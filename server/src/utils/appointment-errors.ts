import { AppError } from './app-error.js';
export function slotUnavailable() {
  return new AppError(
    409,
    'The selected time slot is no longer available',
    'APPOINTMENT_SLOT_UNAVAILABLE',
  );
}
// Prisma/adapter versions wrap PostgreSQL errors differently. Inspect codes only, never expose metadata.
function hasConflictCode(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 6) return false;
  const value = error as Record<string, unknown>;
  if (
    [value.code, value.originalCode, value.sqlState].some(
      (code) =>
        code === '23P01' ||
        code === '40001' ||
        code === '40P01' ||
        code === 'P2034',
    )
  )
    return true;
  return ['cause', 'meta', 'driverAdapterError'].some((key) =>
    hasConflictCode(value[key], depth + 1),
  );
}
export function mapAppointmentWriteError(error: unknown): never {
  if (hasConflictCode(error)) throw slotUnavailable();
  throw error;
}
