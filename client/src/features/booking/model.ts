import { z } from 'zod';

export const selectionSchema = z.object({
  serviceId: z.uuid().catch(''),
  employeeId: z.uuid().catch(''),
  date: z.iso.date().catch(''),
  startTime: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .catch(''),
});
export type Selection = z.infer<typeof selectionSchema>;
export const notesSchema = z.object({
  notes: z.string().trim().max(500, 'Usa como máximo 500 caracteres.'),
});
export type Notes = z.infer<typeof notesSchema>;
export function readSelection(search: string): Selection {
  return selectionSchema.parse(Object.fromEntries(new URLSearchParams(search)));
}
export function bookingReturnTo(businessId: string, selection: Selection) {
  return `/businesses/${businessId}/book?${new URLSearchParams(selection)}`;
}
// Only the booking route and its validated public selections can be a login destination.
export function safeBookingReturn(state: unknown): string | null {
  if (
    !state ||
    typeof state !== 'object' ||
    !('returnTo' in state) ||
    typeof state.returnTo !== 'string'
  )
    return null;
  const match = /^\/businesses\/([a-f\d-]+)\/book(?:\?([^#]*))?$/i.exec(
    state.returnTo,
  );
  if (!match?.[1] || !z.uuid().safeParse(match[1]).success) return null;
  return bookingReturnTo(match[1], readSelection(match[2] ?? ''));
}
export function todayAt(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validDate(date: string, timeZone: string) {
  return (
    z.iso.date().safeParse(date).success &&
    date >= todayAt(timeZone) &&
    !date.startsWith('0000-')
  );
}
export function dateLabel(date: string) {
  // A date-only label is a calendar value, not an instant in the browser timezone.
  return new Intl.DateTimeFormat('es', {
    timeZone: 'UTC',
    dateStyle: 'long',
  }).format(new Date(`${date}T12:00:00Z`));
}
