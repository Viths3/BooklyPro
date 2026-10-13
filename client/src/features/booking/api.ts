import { z } from 'zod';
import { ApiError, apiRequest } from '../../api/client';
import { businessApi } from '../businesses/api';
import type { SessionManager } from '../auth/session';
import type { Selection } from './model';

export type AvailabilityInput = Omit<Selection, 'startTime'> & {
  businessId: string;
};
export type AppointmentInput = Selection & {
  businessId: string;
  notes?: string;
};
const availabilitySchema = z.object({
  data: z.object({
    businessId: z.uuid(),
    serviceId: z.uuid(),
    employeeId: z.uuid(),
    date: z.iso.date(),
    durationMinutes: z.number(),
    slots: z.array(z.object({ startTime: z.string(), endTime: z.string() })),
  }),
});
const appointmentSchema = z.object({
  data: z.object({
    id: z.string(),
    status: z.literal('PENDING'),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    priceAtBooking: z.string(),
    business: z.object({ name: z.string(), timeZone: z.string() }),
    service: z.object({ name: z.string() }),
    employee: z.object({ firstName: z.string(), lastName: z.string() }),
  }),
});
export type BookedAppointment = z.infer<typeof appointmentSchema>['data'];
export const bookingApi = {
  async employees(businessId: string, serviceId: string, signal?: AbortSignal) {
    const { data: employees } = await businessApi.employees(businessId, signal);
    const eligible = await Promise.all(
      employees.map(async (employee) => {
        try {
          const result = z
            .object({ data: z.array(z.object({ id: z.string() })) })
            .parse(
              await apiRequest(
                `/api/employees/${encodeURIComponent(employee.id)}/services`,
                { signal },
              ),
            );
          return result.data.some((service) => service.id === serviceId)
            ? employee
            : null;
        } catch (error) {
          // An employee may be deactivated between the public list and this request.
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }
      }),
    );
    return eligible.filter((employee) => employee !== null);
  },
  async availability(input: AvailabilityInput, signal?: AbortSignal) {
    return availabilitySchema.parse(
      await apiRequest(`/api/availability?${new URLSearchParams(input)}`, {
        signal,
      }),
    ).data;
  },
  async create(session: SessionManager, input: AppointmentInput) {
    return appointmentSchema.parse(
      await session.request('/api/appointments', {
        method: 'POST',
        body: input,
      }),
    ).data;
  },
};
