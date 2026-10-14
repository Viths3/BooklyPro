import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { ApiError, type RequestOptions } from '../../api/client';
import {
  businessSchema,
  employeeSchema,
  ownerKeys,
  readList,
  serviceSchema,
} from './api';

export function useOwnedBusinesses() {
  const { user, session } = useAuth();
  return useQuery({
    queryKey: ownerKeys.mine(user!.id),
    queryFn: ({ signal }) =>
      readList(session, '/api/businesses/me', businessSchema, signal),
    staleTime: 0,
  });
}
export function useServices(id: string) {
  const { user, session } = useAuth();
  return useQuery({
    queryKey: ownerKeys.section(user!.id, id, 'services'),
    queryFn: ({ signal }) =>
      readList(
        session,
        `/api/businesses/${id}/services/manage`,
        serviceSchema,
        signal,
      ),
  });
}
export function useEmployees(id: string) {
  const { user, session } = useAuth();
  return useQuery({
    queryKey: ownerKeys.section(user!.id, id, 'employees'),
    queryFn: ({ signal }) =>
      readList(
        session,
        `/api/businesses/${id}/employees/manage`,
        employeeSchema,
        signal,
      ),
  });
}
type Area =
  'business' | 'services' | 'employees' | 'schedules' | 'appointments';
export function useOwnerMutation(id: string, area: Area) {
  const { user, session } = useAuth();
  const cache = useQueryClient();
  const refreshAppointments = () =>
    cache.invalidateQueries({ queryKey: ['appointments', user!.id] });
  return useMutation({
    mutationFn: ({
      path,
      ...options
    }: {
      path: string;
      method: RequestOptions['method'];
      body?: unknown;
    }) => session.request<unknown>(path, options),
    onError: async (error) => {
      if (
        area === 'appointments' &&
        error instanceof ApiError &&
        error.status === 409
      )
        await refreshAppointments();
    },
    onSuccess: async () => {
      const pending: Promise<unknown>[] = [];
      if (area === 'business')
        pending.push(
          cache.invalidateQueries({ queryKey: ownerKeys.mine(user!.id) }),
          cache.invalidateQueries({ queryKey: ['businesses'] }),
        );
      const sections =
        area === 'business'
          ? ['services', 'employees', 'schedules']
          : area === 'services'
            ? ['services', 'employees']
            : area === 'appointments'
              ? []
              : [area];
      for (const section of sections)
        pending.push(
          cache.invalidateQueries({
            queryKey: ['owner', user!.id, id, section],
          }),
        );
      if (['services', 'business'].includes(area))
        pending.push(cache.invalidateQueries({ queryKey: ['services', id] }));
      if (['employees', 'business'].includes(area))
        pending.push(cache.invalidateQueries({ queryKey: ['employees', id] }));
      if (['services', 'employees', 'business'].includes(area))
        pending.push(
          cache.invalidateQueries({ queryKey: ['booking-employees', id] }),
        );
      pending.push(cache.invalidateQueries({ queryKey: ['availability', id] }));
      if (area === 'appointments') pending.push(refreshAppointments());
      await Promise.all(pending);
    },
  });
}
