import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import type { Filters } from '../features/appointments/api';
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000,
        retry: (count, error) =>
          !(
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}
export const queryKeys = {
  appointments: {
    all: ['appointments'] as const,
    me: (userId: string, filters: Filters) =>
      ['appointments', userId, 'me', filters] as const,
    detail: (userId: string, id: string) =>
      ['appointments', userId, 'detail', id] as const,
  },
  businesses: {
    all: ['businesses'] as const,
    list: (page: number, search: string) =>
      ['businesses', 'list', page, search] as const,
    detail: (id: string) => ['businesses', 'detail', id] as const,
  },
  services: (id: string) => ['services', id] as const,
  employees: (id: string) => ['employees', id] as const,
  reviews: (id: string) => ['reviews', id] as const,
  bookingEmployees: (businessId: string, serviceId: string) =>
    ['booking-employees', businessId, serviceId] as const,
  availability: (
    businessId: string,
    serviceId: string,
    employeeId: string,
    date: string,
  ) => ['availability', businessId, serviceId, employeeId, date] as const,
};
