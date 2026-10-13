import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../features/auth/AuthProvider';
import { SessionManager } from '../features/auth/session';
import {
  appointmentDate,
  isUpcoming,
  reviewSchema,
  statuses,
  statusLabels,
  type AppointmentDetail,
} from '../features/appointments/api';
import { safeReturnTo } from '../features/auth/returnTo';

const id = '198f33a7-03e9-4255-826d-33c702d29565';
const businessId = 'ce0bfad3-e120-48cc-8b3e-ad84bd37e172';
const user = {
  id: 'customer-id',
  firstName: 'Ana',
  lastName: 'Mora',
  email: 'ana@example.test',
  role: 'CUSTOMER',
};
const fixture: AppointmentDetail = {
  id,
  customerId: user.id,
  startTime: '2099-10-15T15:30:00.000Z',
  endTime: '2099-10-15T16:00:00.000Z',
  status: 'PENDING',
  notes: 'Sin perfume',
  hasReview: false,
  business: { id: businessId, name: 'Oliva', timeZone: 'America/Guayaquil' },
  service: { name: 'Corte clásico' },
  employee: { firstName: 'Carlos', lastName: 'Mora' },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const error = (code: string, status = 409) =>
  json({ error: { code, message: 'Technical details' } }, status);
let row: AppointmentDetail;
let empty: boolean;
let failList: boolean;
let reviewError: string | null;
let cancelError: string | null;
let fetchMock: ReturnType<
  typeof vi.fn<(input: string, options?: RequestInit) => Promise<Response>>
>;
beforeEach(() => {
  row = structuredClone(fixture);
  empty = false;
  failList = false;
  reviewError = null;
  cancelError = null;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    const path = url.pathname;
    if (path === '/api/auth/login')
      return json({
        data: { user, accessToken: 'access', refreshToken: 'refresh' },
      });
    if (path === '/api/auth/me') return json({ data: user });
    if (path === '/api/appointments/me') {
      if (failList) return error('SERVER_ERROR', 503);
      const status = url.searchParams.get('status');
      const data = empty || (status && row.status !== status) ? [] : [row];
      return json({
        data,
        pagination: {
          page: Number(url.searchParams.get('page') ?? 1),
          limit: Number(url.searchParams.get('limit') ?? 10),
          total: data.length ? 11 : 0,
          totalPages: data.length ? 2 : 0,
        },
      });
    }
    if (path.endsWith('/cancel')) {
      if (cancelError) return error(cancelError);
      row.status = 'CANCELLED';
      return json({ data: row });
    }
    if (path.endsWith('/review')) {
      if (reviewError) return error(reviewError);
      row.hasReview = true;
      return json({ data: { id: 'review-id' } }, 201);
    }
    if (path === `/api/appointments/${id}`)
      return json({
        data: {
          ...row,
          customer: { email: 'private-secret@example.test' },
          ownerId: 'private-owner-id',
        },
      });
    throw Error(`Unexpected endpoint ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
async function setup(path = '/dashboard/appointments', authenticated = true) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const session = new SessionManager(() => cache.clear());
  if (authenticated)
    await session.login({ email: user.email, password: 'Password123!' });
  render(
    <QueryClientProvider client={cache}>
      <AuthProvider manager={session}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return cache;
}
const detail = () => setup(`/dashboard/appointments/${id}`);
const click = async (name: string) =>
  userEvent.click(await screen.findByRole('button', { name }));
const requests = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === path);
describe('customer dashboard', () => {
  it('requires authentication and preserves an appointment deep link through login', async () => {
    await setup(`/dashboard/appointments/${id}`, false);
    expect(
      await screen.findByRole('heading', { name: 'Vuelve a tu espacio.' }),
    ).toBeVisible();
    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      user.email,
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Password123!');
    await click('Iniciar sesión');
    expect(
      await screen.findByRole('heading', { name: 'Detalle de tu cita' }),
    ).toBeVisible();
  });
  it('overview fetches pending/confirmed totals and nearest appointment with limit one', async () => {
    await setup('/dashboard');
    expect(
      await screen.findByText('11 citas próximas al abrir este resumen.'),
    ).toBeVisible();
    expect(screen.getByText('Oliva')).toBeVisible();
    const params = requests('/api/appointments/me').map(
      ([url]) => new URL(url).searchParams,
    );
    expect(params.map((p) => p.get('status')).sort()).toEqual([
      'CONFIRMED',
      'PENDING',
    ]);
    expect(params.every((p) => p.get('limit') === '1' && p.get('from'))).toBe(
      true,
    );
  });
  it('lists real data and splits future active appointments from history', async () => {
    await setup();
    expect(await screen.findByText('Oliva')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Próximas citas' }),
    ).toBeVisible();
    expect(
      screen.getByText('No hay citas de historial en esta página.'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Ver detalles →' }),
    ).toHaveAttribute('href', `/dashboard/appointments/${id}`);
  });
  it('shows loading while the list request is pending', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) =>
      url.includes('/appointments/me')
        ? new Promise(() => {})
        : original(url, options),
    );
    await setup();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando tus citas');
  });
  it('shows retry on list errors', async () => {
    failList = true;
    await setup();
    expect(await screen.findByRole('alert')).toBeVisible();
    failList = false;
    await click('Volver a intentar');
    expect(await screen.findByText('Oliva')).toBeVisible();
  });
  it('shows an empty state and business link', async () => {
    empty = true;
    await setup();
    expect(
      await screen.findByText('Todavía no tienes citas en esta página.'),
    ).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: /Explorar negocios/ }).length,
    ).toBeGreaterThan(0);
  });
  for (const status of statuses) {
    it(`renders ${status} with accessible text`, async () => {
      row.status = status;
      await setup();
      expect(
        await screen.findByText(statusLabels[status], { selector: 'span' }),
      ).toBeVisible();
    });
    it(`${status} has only permitted actions`, async () => {
      row.status = status;
      await detail();
      await screen.findByRole('heading', { name: 'Detalle de tu cita' });
      expect(
        Boolean(screen.queryByRole('button', { name: 'Cancelar cita' })),
      ).toBe(['PENDING', 'CONFIRMED'].includes(status));
      expect(
        Boolean(screen.queryByRole('button', { name: 'Dejar reseña' })),
      ).toBe(status === 'COMPLETED');
      expect(
        screen.queryByRole('button', {
          name: /Confirmar cita|Completar|No show/,
        }),
      ).not.toBeInTheDocument();
    });
  }
  it('detail formats business timezone and renders notes without private fields', async () => {
    await detail();
    expect(await screen.findByText('Sin perfume')).toBeVisible();
    expect(screen.getByText('10:30')).toBeVisible();
    expect(screen.getByText('11:00')).toBeVisible();
    expect(
      screen.queryByText('private-secret@example.test'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('private-owner-id')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ir al negocio ↗' }),
    ).toHaveAttribute('href', `/businesses/${businessId}`);
  });
  it('cancel dialog can be dismissed without a mutation', async () => {
    await detail();
    await click('Cancelar cita');
    expect(screen.getByRole('dialog')).toBeVisible();
    await click('Conservar cita');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(`/api/appointments/${id}/cancel`)).toHaveLength(0);
  });
  it('cancels with PATCH, invalidates caches, and updates detail without reload', async () => {
    const cache = await detail();
    const invalidate = vi.spyOn(cache, 'invalidateQueries');
    await click('Cancelar cita');
    await click('Sí, cancelar cita');
    expect(await screen.findByText('Tu cita fue cancelada.')).toBeVisible();
    expect(screen.getByText('Cancelada')).toBeVisible();
    expect(requests(`/api/appointments/${id}/cancel`)[0]?.[1]?.method).toBe(
      'PATCH',
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['appointments'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['availability', businessId],
    });
    expect(
      screen.queryByRole('button', { name: 'Cancelar cita' }),
    ).not.toBeInTheDocument();
  });
  it('handles an already-cancelled success idempotently', async () => {
    await detail();
    await click('Cancelar cita');
    row.status = 'CANCELLED';
    await click('Sí, cancelar cita');
    expect(await screen.findByText('Tu cita fue cancelada.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  for (const code of [
    'APPOINTMENT_NOT_FOUND',
    'FORBIDDEN',
    'INVALID_APPOINTMENT_STATUS_TRANSITION',
  ])
    it(`handles ${code} on cancellation`, async () => {
      cancelError = code;
      await detail();
      await click('Cancelar cita');
      await click('Sí, cancelar cita');
      expect(await screen.findByRole('alert')).not.toHaveTextContent(code);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  it('existing review hides creation without per-card review calls', async () => {
    row.status = 'COMPLETED';
    row.hasReview = true;
    await detail();
    expect(
      await screen.findByText('Ya dejaste una reseña para esta cita.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Dejar reseña' }),
    ).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/reviews'))).toBe(
      false,
    );
  });
  it('invalid rating never submits', async () => {
    row.status = 'COMPLETED';
    await detail();
    await click('Dejar reseña');
    await click('Publicar reseña');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Selecciona una valoración',
    );
    expect(requests(`/api/appointments/${id}/review`)).toHaveLength(0);
  });
  it('creates a review with normalized fields and invalidates public reviews', async () => {
    row.status = 'COMPLETED';
    const cache = await detail();
    const invalidate = vi.spyOn(cache, 'invalidateQueries');
    await click('Dejar reseña');
    await userEvent.click(screen.getByRole('radio', { name: '5' }));
    await userEvent.type(
      screen.getByLabelText('Comentario (opcional)'),
      ' Excelente ',
    );
    await click('Publicar reseña');
    expect(
      await screen.findByText('Gracias. Tu reseña fue publicada.'),
    ).toBeVisible();
    const options = requests(`/api/appointments/${id}/review`)[0]?.[1];
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({
      rating: 5,
      comment: 'Excelente',
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['reviews', businessId],
    });
    expect(
      screen.queryByRole('button', { name: 'Publicar reseña' }),
    ).not.toBeInTheDocument();
  });
  it('duplicate review stops further submissions and informs the user', async () => {
    row.status = 'COMPLETED';
    reviewError = 'REVIEW_ALREADY_EXISTS';
    await detail();
    await click('Dejar reseña');
    await userEvent.click(screen.getByRole('radio', { name: '4' }));
    await click('Publicar reseña');
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Publicar reseña' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getAllByText('Ya dejaste una reseña para esta cita.').length,
    ).toBeGreaterThan(0);
    expect(requests(`/api/appointments/${id}/review`)).toHaveLength(1);
  });
  it('filters on the server and resets pagination', async () => {
    await setup('/dashboard/appointments?page=2');
    await screen.findByText('Oliva');
    await userEvent.selectOptions(
      screen.getByLabelText('Filtrar por estado'),
      'COMPLETED',
    );
    expect(
      await screen.findByText('No hay citas con este estado.'),
    ).toBeVisible();
    const url = new URL(requests('/api/appointments/me').at(-1)![0]);
    expect(url.searchParams.get('status')).toBe('COMPLETED');
    expect(url.searchParams.get('page')).toBe('1');
  });
  it('uses server page metadata for previous and next', async () => {
    await setup();
    await screen.findByText('Oliva');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await click('Siguiente');
    expect(await screen.findByText('Página 2 de 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await click('Anterior');
    expect(await screen.findByText('Página 1 de 2')).toBeVisible();
  });
  it('does not offer customer mutations for an appointment owned by another customer', async () => {
    row.customerId = 'someone-else';
    await detail();
    await screen.findByText('Sin perfume');
    expect(
      screen.queryByRole('button', { name: 'Cancelar cita' }),
    ).not.toBeInTheDocument();
  });
  it('review validates rating integer and comment limit', () => {
    for (const rating of [0, 6, 1.5])
      expect(reviewSchema.safeParse({ rating, comment: '' }).success).toBe(
        false,
      );
    expect(
      reviewSchema.safeParse({ rating: 5, comment: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
  it('classifies final future and past active appointments into history and uses business timezone', () => {
    const now = Date.parse('2099-10-14T00:00:00Z');
    expect(isUpcoming(fixture, now)).toBe(true);
    expect(isUpcoming({ ...fixture, status: 'CANCELLED' }, now)).toBe(false);
    expect(isUpcoming(fixture, Date.parse('2100-01-01'))).toBe(false);
    expect(
      appointmentDate('2026-10-15T02:00:00Z', 'America/Guayaquil', 'date'),
    ).toContain('14');
  });
  it('rejects external deep links', () => {
    for (const returnTo of [
      'https://evil.test',
      '//evil.test',
      '/dashboard/../evil',
      '/dashboard?next=https://evil.test',
    ])
      expect(safeReturnTo({ returnTo })).toBeNull();
    expect(safeReturnTo({ returnTo: `/dashboard/appointments/${id}` })).toBe(
      `/dashboard/appointments/${id}`,
    );
  });
  it('Escape dismisses cancellation confirmation', async () => {
    await detail();
    await click('Cancelar cita');
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
