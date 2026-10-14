import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import { AuthProvider } from '../features/auth/AuthProvider';
import { SessionManager } from '../features/auth/session';
import {
  notesSchema,
  safeBookingReturn,
  todayAt,
  dateLabel,
} from '../features/booking/model';

const businessId = 'e3a63b23-dc70-4d42-8011-021e0b3e04a6';
const serviceId = 'b60cc025-cc93-48e8-b976-333dc110d353';
const otherService = '9a654e23-a514-4264-9a4a-bca2f7854b42';
const employeeId = '5b16df6f-1316-446d-9b44-aa72154e4859';
const secondEmployee = '275b9720-ad63-4c68-828c-9d6371950de2';
const excludedEmployee = '37bab4ed-898d-46f0-9227-e0ac75b11c3c';
const date = '2099-10-15';
const route = `/businesses/${businessId}/book`;
const business = {
  id: businessId,
  name: 'Estudio Oliva',
  description: null,
  address: 'Quito',
  phone: null,
  imageUrl: null,
  currency: 'USD',
  timeZone: 'America/Guayaquil',
};
const service = {
  id: serviceId,
  name: 'Corte clásico',
  description: 'A tu estilo',
  price: '8.00',
  durationMinutes: 30,
};
const employees = [
  { id: employeeId, firstName: 'Carlos', lastName: 'Mora' },
  { id: secondEmployee, firstName: 'Ana', lastName: 'Luna' },
  { id: excludedEmployee, firstName: 'No', lastName: 'Asignado' },
];
const user = {
  id: 'user-1',
  firstName: 'Eva',
  lastName: 'Mora',
  email: 'eva@example.com',
  role: 'CUSTOMER',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const failure = (code: string, status = 400) =>
  json({ error: { code, message: 'Technical backend message' } }, status);
let slots: { startTime: string; endTime: string }[];
let availabilityError: string | null;
let appointmentError: string | null;
let holdAvailability: Promise<void> | null;
let fetchMock: ReturnType<
  typeof vi.fn<(input: string, options?: RequestInit) => Promise<Response>>
>;
beforeEach(() => {
  slots = [
    { startTime: '10:30', endTime: '11:00' },
    { startTime: '11:00', endTime: '11:30' },
  ];
  availabilityError = null;
  appointmentError = null;
  holdAvailability = null;
  fetchMock = vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input);
    const path = url.pathname;
    if (path === '/api/auth/login')
      return json({
        data: { user, accessToken: 'access', refreshToken: 'refresh' },
      });
    if (path === '/api/auth/me') return json({ data: user });
    if (path === `/api/businesses/${businessId}`)
      return json({ data: business });
    if (path === `/api/businesses/${businessId}/services`)
      return json({
        data: [service, { ...service, id: otherService, name: 'Barba' }],
      });
    if (path === `/api/businesses/${businessId}/employees`)
      return json({ data: employees });
    if (path.startsWith('/api/employees/'))
      return json({
        data: path.includes(excludedEmployee)
          ? []
          : [{ id: serviceId }, { id: otherService }],
      });
    if (path === '/api/availability') {
      await holdAvailability;
      if (availabilityError) return failure(availabilityError);
      return json({
        data: {
          businessId,
          serviceId: url.searchParams.get('serviceId'),
          employeeId: url.searchParams.get('employeeId'),
          date: url.searchParams.get('date'),
          durationMinutes: 30,
          slots,
        },
      });
    }
    if (path === '/api/appointments') {
      if (appointmentError) return failure(appointmentError, 409);
      const body = JSON.parse(String(options?.body));
      return json(
        {
          data: {
            id: 'appointment-1',
            status: 'PENDING',
            startTime: `${body.date}T15:30:00.000Z`,
            endTime: `${body.date}T16:00:00.000Z`,
            priceAtBooking: '8.00',
            business,
            service,
            employee: employees[0],
          },
        },
        201,
      );
    }
    throw Error(`Unexpected endpoint ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
async function setup(authenticated = false, path = route) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const manager = new SessionManager(() => cache.clear());
  if (authenticated)
    await manager.login({ email: user.email, password: 'password-example' });
  render(
    <QueryClientProvider client={cache}>
      <AuthProvider manager={manager}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return cache;
}
const click = async (name: string | RegExp) =>
  userEvent.click(await screen.findByRole('button', { name }));
async function selectService() {
  await click(/Corte clásico/);
  await click('Continuar');
}
async function selectEmployee() {
  await selectService();
  await click(/Carlos Mora/);
  await click('Continuar');
}
async function chooseDate(value = date) {
  await selectEmployee();
  fireEvent.change(await screen.findByLabelText('Fecha de la cita'), {
    target: { value },
  });
}
async function reachSlots() {
  await chooseDate();
  await click('Continuar');
}
async function summary() {
  await reachSlots();
  await click('10:30');
  await click('Continuar');
  await screen.findByRole('heading', { name: 'Revisa tu reserva.' });
}
function calls(path: string) {
  return fetchMock.mock.calls.filter(
    ([url]) => new URL(String(url)).pathname === path,
  );
}

describe('booking wizard', () => {
  it('loads active services with price and duration', async () => {
    await setup();
    expect(
      await screen.findByRole('button', {
        name: /Corte clásico.*30 min.*8.00 USD/,
      }),
    ).toBeVisible();
  });
  it('cannot continue without a service and marks exactly one selected', async () => {
    await setup();
    await screen.findByRole('button', { name: /Corte clásico/ });
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await click(/Corte clásico/);
    expect(
      screen.getByRole('button', { name: /Corte clásico/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await click(/Barba/);
    expect(
      screen.getByRole('button', { name: /Corte clásico/ }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
  it('loads employees and filters out those without the service', async () => {
    await setup();
    await selectService();
    expect(
      await screen.findByRole('button', { name: /Carlos Mora/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /No Asignado/ }),
    ).not.toBeInTheDocument();
    expect(calls(`/api/employees/${excludedEmployee}/services`)).toHaveLength(
      1,
    );
  });
  it('requires selecting an employee before continuing', async () => {
    await setup();
    await selectService();
    await screen.findByRole('button', { name: /Carlos Mora/ });
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await click(/Carlos Mora/);
    expect(screen.getByRole('button', { name: /Carlos Mora/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });
  it('rejects past dates without querying availability', async () => {
    await setup();
    await chooseDate('2000-01-01');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    expect(screen.getByLabelText('Fecha de la cita')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(calls('/api/availability')).toHaveLength(0);
  });
  it('shows availability loading', async () => {
    holdAvailability = new Promise(() => {});
    await setup();
    await reachSlots();
    expect(
      await screen.findByText('Consultando disponibilidad…'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });
  it('queries exact availability parameters and selects a slot', async () => {
    await setup();
    await reachSlots();
    await click('10:30');
    expect(screen.getByRole('button', { name: '10:30' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const [url] = calls('/api/availability')[0]!;
    expect(Object.fromEntries(new URL(String(url)).searchParams)).toEqual({
      businessId,
      serviceId,
      employeeId,
      date,
    });
  });
  it('shows a useful empty state and allows going back', async () => {
    slots = [];
    await setup();
    await reachSlots();
    expect(
      await screen.findByText('No hay horarios disponibles para esta fecha.'),
    ).toBeVisible();
    await click('Elegir otra fecha');
    expect(await screen.findByLabelText('Fecha de la cita')).toBeVisible();
    expect(screen.getByLabelText('Fecha de la cita')).toHaveValue(date);
  });
  it('changing date clears selected slot', async () => {
    await setup();
    await summary();
    await click('Atrás');
    await click('Atrás');
    fireEvent.change(screen.getByLabelText('Fecha de la cita'), {
      target: { value: '2099-10-16' },
    });
    await click('Continuar');
    expect(
      await screen.findByRole('button', { name: '10:30' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });
  it('changing employee clears selected slot', async () => {
    await setup();
    await summary();
    await click('Atrás');
    await click('Atrás');
    await click('Atrás');
    await click(/Ana Luna/);
    await click('Continuar');
    await click('Continuar');
    expect(
      await screen.findByRole('button', { name: '10:30' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
  it('changing service clears employee, date and slot', async () => {
    await setup();
    await summary();
    for (let i = 0; i < 4; i++) await click('Atrás');
    await click(/Barba/);
    await click('Continuar');
    expect(
      await screen.findByRole('button', { name: /Carlos Mora/ }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await click(/Carlos Mora/);
    await click('Continuar');
    expect(screen.getByLabelText('Fecha de la cita')).toHaveValue('');
  });
  it('summary contains business, service, employee, date, time, timezone and Decimal text', async () => {
    await setup();
    await summary();
    for (const text of [
      'Estudio Oliva',
      'Corte clásico',
      'Carlos Mora',
      '15 de octubre de 2099',
      '10:30 – 11:00 · America/Guayaquil',
      '30 min',
      '8.00 USD',
    ])
      expect(screen.getByText(text)).toBeVisible();
  });
  it('anonymous confirmation goes through login and restores public selections, not notes', async () => {
    await setup();
    await summary();
    await userEvent.type(
      screen.getByLabelText('Notas (opcional)'),
      'Nota privada',
    );
    await click('Iniciar sesión para confirmar');
    expect(
      await screen.findByRole('heading', { name: 'Vuelve a tu espacio.' }),
    ).toBeVisible();
    expect(calls('/api/appointments')).toHaveLength(0);
    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      user.email,
    );
    await userEvent.type(
      screen.getByLabelText('Contraseña'),
      'password-example',
    );
    await click('Iniciar sesión');
    expect(
      await screen.findByRole('button', { name: 'Confirmar cita' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Notas (opcional)')).toHaveValue('');
    expect(screen.getByText('10:30 – 11:00 · America/Guayaquil')).toBeVisible();
    expect(calls('/api/appointments')).toHaveLength(0);
  });
  it('authenticated confirmation creates the exact body and displays PENDING success', async () => {
    await setup(true);
    await summary();
    await userEvent.type(
      screen.getByLabelText('Notas (opcional)'),
      '  Gracias  ',
    );
    await click('Confirmar cita');
    expect(
      await screen.findByText('PENDING · Pendiente de confirmación'),
    ).toBeVisible();
    const [, options] = calls('/api/appointments')[0]!;
    expect(JSON.parse(String(options?.body))).toEqual({
      businessId,
      serviceId,
      employeeId,
      date,
      startTime: '10:30',
      notes: 'Gracias',
    });
    expect(new Headers(options?.headers).get('Authorization')).toBe(
      'Bearer access',
    );
    expect(screen.getByRole('link', { name: 'Ver mis citas' })).toHaveAttribute(
      'href',
      '/dashboard/appointments',
    );
  });
  it('slot conflict clears selection, refreshes slots and returns to time selection', async () => {
    await setup(true);
    await summary();
    const before = calls('/api/availability').length;
    appointmentError = 'APPOINTMENT_SLOT_UNAVAILABLE';
    slots = [{ startTime: '11:00', endTime: '11:30' }];
    await click('Confirmar cita');
    expect(
      await screen.findByText(
        'Este horario acaba de ser reservado. Elige otro horario.',
      ),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', { name: '11:00' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.queryByRole('button', { name: '10:30' }),
    ).not.toBeInTheDocument();
    expect(calls('/api/availability').length).toBeGreaterThan(before);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });
  it('availability business errors render a friendly message', async () => {
    availabilityError = 'SERVICE_NOT_ASSIGNED_TO_EMPLOYEE';
    await setup();
    await reachSlots();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este profesional ya no realiza el servicio.',
    );
  });
  it('creation errors retain summary without claiming success', async () => {
    appointmentError = 'SERVICE_INACTIVE';
    await setup(true);
    await summary();
    await click('Confirmar cita');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este servicio ya no está disponible.',
    );
    expect(
      screen.queryByText(/Tu reserva fue creada correctamente/),
    ).not.toBeInTheDocument();
  });
  it('notes enforce the backend limit both in HTML and Zod', async () => {
    await setup();
    await summary();
    expect(screen.getByLabelText('Notas (opcional)')).toHaveAttribute(
      'maxlength',
      '500',
    );
    expect(notesSchema.safeParse({ notes: 'x'.repeat(500) }).success).toBe(
      true,
    );
    expect(notesSchema.safeParse({ notes: 'x'.repeat(501) }).success).toBe(
      false,
    );
    fireEvent.change(screen.getByLabelText('Notas (opcional)'), {
      target: { value: 'x'.repeat(501) },
    });
    await click('Iniciar sesión para confirmar');
    expect(
      await screen.findByText('Usa como máximo 500 caracteres.'),
    ).toBeVisible();
    expect(calls('/api/appointments')).toHaveLength(0);
  });
  it('restored unavailable slot cannot be confirmed', async () => {
    await setup(
      true,
      `${route}?${new URLSearchParams({ serviceId, employeeId, date, startTime: '09:00' })}`,
    );
    expect(await screen.findByRole('button', { name: '10:30' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Confirmar cita' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });
  it('navigates backward without losing unchanged selections', async () => {
    await setup();
    await summary();
    await click('Atrás');
    expect(
      await screen.findByRole('button', { name: '10:30' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await click('Atrás');
    expect(screen.getByLabelText('Fecha de la cita')).toHaveValue(date);
    await click('Atrás');
    expect(
      await screen.findByRole('button', { name: /Carlos Mora/ }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
  it('rejects external and malformed auth returns and strips unknown query fields', () => {
    for (const returnTo of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/dashboard',
      '/businesses/invalid/book',
      `${route}#oops`,
    ])
      expect(safeBookingReturn({ returnTo })).toBeNull();
    const result = safeBookingReturn({
      returnTo: `${route}?serviceId=${serviceId}&notes=private&token=secret`,
    });
    expect(result).toContain(serviceId);
    expect(result).not.toContain('private');
    expect(result).not.toContain('secret');
  });
  it('uses the business calendar date across timezone and UTC boundaries', () => {
    const now = new Date('2026-10-15T02:00:00Z');
    expect(todayAt('America/Guayaquil', now)).toBe('2026-10-14');
    expect(todayAt('Asia/Tokyo', now)).toBe('2026-10-15');
    expect(dateLabel('2026-10-15')).toBe('15 de octubre de 2026');
  });
  it('failed employee assignment lookup blocks the list instead of inventing eligibility', async () => {
    fetchMock.mockImplementation(async (input: string) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/employees')) return json({ data: employees });
      if (path.startsWith('/api/employees/'))
        return failure('SERVER_ERROR', 503);
      if (path.endsWith('/services')) return json({ data: [service] });
      return json({ data: business });
    });
    await setup();
    await selectService();
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Carlos Mora/ }),
    ).not.toBeInTheDocument();
  });
  it('prevents double submission while creation is pending', async () => {
    await setup(true);
    await summary();
    const original = fetchMock.getMockImplementation()!;
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation((input: string, options?: RequestInit) =>
      new URL(input).pathname === '/api/appointments'
        ? new Promise<Response>((done) => {
            resolve = done;
          })
        : original(input, options),
    );
    await click('Confirmar cita');
    expect(
      await screen.findByRole('button', { name: 'Confirmando…' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Atrás' })).toBeDisabled();
    expect(calls('/api/appointments')).toHaveLength(1);
    resolve(failure('SERVICE_INACTIVE', 409));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Confirmar cita' }),
      ).toBeEnabled(),
    );
  });
});
