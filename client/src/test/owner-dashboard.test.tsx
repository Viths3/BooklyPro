import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import { AuthProvider } from '../features/auth/AuthProvider';
import { SessionManager } from '../features/auth/session';
import {
  type Business,
  type Employee,
  type Service,
  type OwnerAppointment,
  days,
} from '../features/owner/api';
import { fieldsSchema, formBody } from '../features/owner/OwnerForm';
import { safeReturnTo } from '../features/auth/returnTo';
import { scheduleBody, weekSchema } from '../features/owner/SchedulesPage';
import { statusLabels, type Status } from '../features/appointments/api';
const bid = 'ce0bfad3-e120-48cc-8b3e-ad84bd37e172';
const sid = '198f33a7-03e9-4255-826d-33c702d29565';
const eid = '198f33a7-03e9-4255-826d-33c702d29566';
const aid = '198f33a7-03e9-4255-826d-33c702d29567';
const base = `/dashboard/businesses/${bid}`;
const business: Business = {
  id: bid,
  name: 'Oliva',
  description: 'Salón',
  phone: null,
  address: 'Quito',
  imageUrl: null,
  active: true,
  timeZone: 'America/Guayaquil',
  currency: 'USD',
};
const service: Service = {
  id: sid,
  name: 'Corte',
  description: null,
  price: '8.00',
  durationMinutes: 30,
  active: true,
};
const employee: Employee = {
  id: eid,
  firstName: 'Carlos',
  lastName: 'Mora',
  email: null,
  phone: null,
  active: true,
  services: [],
};
let user: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'CUSTOMER' | 'BUSINESS_OWNER' | 'ADMIN';
};
let businesses: Business[];
let services: Service[];
let employees: Employee[];
let appointments: OwnerAppointment[];
let conflict: boolean;
let failList: boolean;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
let fetchMock: ReturnType<
  typeof vi.fn<(input: string, options?: RequestInit) => Promise<Response>>
>;
beforeEach(() => {
  user = {
    id: 'owner',
    firstName: 'Ana',
    lastName: 'Mora',
    email: 'ana@example.test',
    role: 'BUSINESS_OWNER',
  };
  businesses = [structuredClone(business)];
  services = [structuredClone(service)];
  employees = [structuredClone(employee)];
  appointments = [
    {
      id: aid,
      status: 'PENDING',
      startTime: '2099-10-15T15:00:00.000Z',
      endTime: '2099-10-15T15:30:00.000Z',
      priceAtBooking: '8.00',
      notes: 'Sin perfume',
      customer: { firstName: 'Luis', lastName: 'Paz' },
      employee: { firstName: 'Carlos', lastName: 'Mora' },
      service: { name: 'Corte' },
    },
  ];
  conflict = false;
  failList = false;
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
  fetchMock = vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input);
    const path = url.pathname;
    const method = options?.method ?? 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    if (path === '/api/auth/login')
      return json({
        data: { user, accessToken: 'access', refreshToken: 'refresh' },
      });
    if (path === '/api/auth/me') return json({ data: user });
    if (method !== 'GET' && conflict)
      return json(
        { error: { code: 'CONFLICT', message: 'Internal conflict' } },
        409,
      );
    if (path === '/api/businesses/me')
      return failList
        ? json({ error: { code: 'SERVER_ERROR', message: 'Unavailable' } }, 503)
        : json({ data: businesses });
    if (path === '/api/businesses' && method === 'POST') {
      businesses = [{ ...business, ...body }];
      user = { ...user, role: 'BUSINESS_OWNER' };
      return json({ data: businesses[0] }, 201);
    }
    if (path === `/api/businesses/${bid}`) {
      if (method === 'DELETE') businesses[0]!.active = false;
      else Object.assign(businesses[0]!, body);
      return method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json({ data: businesses[0] });
    }
    if (path.endsWith('/services/manage')) return json({ data: services });
    if (path.endsWith('/employees/manage')) return json({ data: employees });
    if (path.endsWith('/schedules'))
      return method === 'GET'
        ? json({ data: [] })
        : json({ data: body.schedules });
    if (path === `/api/employees/${eid}/services/${sid}`) {
      employees[0]!.services =
        method === 'POST' ? [structuredClone(services[0]!)] : [];
      return new Response(null, { status: 204 });
    }
    if (path === `/api/services/${sid}`) {
      if (method === 'DELETE') services[0]!.active = false;
      else Object.assign(services[0]!, body);
      return method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json({ data: services[0] });
    }
    if (path === `/api/employees/${eid}`) {
      if (method === 'DELETE') employees[0]!.active = false;
      else Object.assign(employees[0]!, body);
      return method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json({ data: employees[0] });
    }
    if (path === `/api/businesses/${bid}/services`) {
      services.push({ ...service, ...body, id: 'new-service' });
      return json({ data: services.at(-1) }, 201);
    }
    if (path === `/api/businesses/${bid}/employees`) {
      employees.push({ ...employee, ...body, id: 'new-employee' });
      return json({ data: employees.at(-1) }, 201);
    }
    if (path.endsWith('/appointments'))
      return json({
        data: appointments,
        pagination: {
          page: Number(url.searchParams.get('page') ?? 1),
          limit: 10,
          total: 11,
          totalPages: 2,
        },
      });
    if (path === `/api/appointments/${aid}/status`) {
      appointments[0]!.status = body.status;
      return json({ data: appointments[0] });
    }
    throw Error(`Unexpected endpoint ${method} ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
async function setup(path = '/dashboard/businesses', authenticated = true) {
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
  return { cache, session };
}
const click = async (name: string) =>
  userEvent.click(await screen.findByRole('button', { name }));
const calls = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([url, options]) =>
      new URL(url).pathname === path && (options?.method ?? 'GET') === method,
  );
const bodyOf = (path: string, method: string) =>
  JSON.parse(String(calls(path, method).at(-1)?.[1]?.body));
describe('owner permissions and businesses', () => {
  it('requires authentication for a deep link', async () => {
    await setup(`${base}/services`, false);
    expect(
      await screen.findByRole('heading', { name: 'Vuelve a tu espacio.' }),
    ).toBeVisible();
    expect(calls('/api/businesses/me')).toHaveLength(0);
  });
  it.each(['CUSTOMER', 'ADMIN'] as const)(
    'denies foreign business to %s without loading management data',
    async (role) => {
      user.role = role;
      businesses = [];
      await setup(`${base}/services`);
      expect(await screen.findByText('Acceso no permitido')).toBeVisible();
      expect(calls(`/api/businesses/${bid}/services/manage`)).toHaveLength(0);
    },
  );
  it('lists owned active and inactive businesses', async () => {
    businesses.push({ ...business, id: 'other', name: 'Otro', active: false });
    await setup();
    expect(await screen.findByText('Oliva')).toBeVisible();
    expect(screen.getByText('Inactivo')).toBeVisible();
  });
  it('shows onboarding empty state', async () => {
    businesses = [];
    await setup();
    expect(await screen.findByText('Aún no tienes negocios')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear negocio' })).toBeEnabled();
  });
  it('shows list errors without management links', async () => {
    failList = true;
    await setup();
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText('Gestionar Oliva')).not.toBeInTheDocument();
  });
  it('creates first business and synchronizes promoted role', async () => {
    user.role = 'CUSTOMER';
    businesses = [];
    const { session } = await setup();
    await click('Crear negocio');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Mi salón');
    await click('Guardar');
    await screen.findByRole('heading', { name: 'Resumen del negocio' });
    expect(session.getSnapshot().user?.role).toBe('BUSINESS_OWNER');
    expect(bodyOf('/api/businesses', 'POST')).toEqual({
      name: 'Mi salón',
      description: null,
      address: null,
      phone: null,
      imageUrl: null,
    });
  });
  it('edits allowed business fields', async () => {
    await setup(base);
    await click('Editar negocio');
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Oliva nueva' },
    });
    await click('Guardar');
    expect(
      await screen.findByRole('heading', { name: 'Oliva nueva' }),
    ).toBeVisible();
    expect(bodyOf(`/api/businesses/${bid}`, 'PATCH')).not.toHaveProperty(
      'active',
    );
  });
  it('requires confirmation to deactivate and offers no reactivation', async () => {
    await setup(base);
    await click('Desactivar negocio');
    expect(calls(`/api/businesses/${bid}`, 'DELETE')).toHaveLength(0);
    await click('Desactivar');
    expect(await screen.findByText('Inactivo')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Reactivar/ }),
    ).not.toBeInTheDocument();
  });
});
describe('managed catalog and assignments', () => {
  it('lists inactive services', async () => {
    services[0]!.active = false;
    await setup(`${base}/services`);
    expect(await screen.findByText('8.00 USD · 30 minutos')).toBeVisible();
    expect(screen.getByText('Inactivo')).toBeVisible();
  });
  it('creates a service with exact decimal text and integer duration', async () => {
    await setup(`${base}/services`);
    await click('Crear servicio');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Masaje');
    await userEvent.type(screen.getByLabelText('Precio'), '9999999999.99');
    await userEvent.type(screen.getByLabelText('Duración (minutos)'), '45');
    await click('Guardar');
    await screen.findByRole('heading', { name: 'Masaje' });
    expect(bodyOf(`/api/businesses/${bid}/services`, 'POST')).toMatchObject({
      price: '9999999999.99',
      durationMinutes: 45,
    });
  });
  it('deactivates then reactivates a service and refreshes its list', async () => {
    await setup(`${base}/services`);
    await click('Desactivar Corte');
    await click('Desactivar');
    await click('Reactivar Corte');
    await screen.findByRole('button', { name: 'Desactivar Corte' });
    expect(bodyOf(`/api/services/${sid}`, 'PATCH')).toEqual({ active: true });
    expect(
      calls(`/api/businesses/${bid}/services/manage`).length,
    ).toBeGreaterThanOrEqual(3);
  });
  it('edits service without sending internal fields', async () => {
    await setup(`${base}/services`);
    await click('Editar Corte');
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '9.50' },
    });
    await click('Guardar');
    await screen.findByText('9.50 USD · 30 minutos');
    expect(bodyOf(`/api/services/${sid}`, 'PATCH')).not.toHaveProperty('id');
  });
  it('disables creation and activation for inactive parent', async () => {
    businesses[0]!.active = false;
    services[0]!.active = false;
    await setup(`${base}/services`);
    expect(
      await screen.findByRole('button', { name: 'Crear servicio' }),
    ).toBeDisabled();
    expect(
      await screen.findByRole('button', { name: 'Reactivar Corte' }),
    ).toBeDisabled();
  });
  it('preserves form input after conflict', async () => {
    conflict = true;
    await setup(`${base}/services`);
    await click('Editar Corte');
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '9.50' },
    });
    await click('Guardar');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo aplicar',
    );
    expect(screen.getByLabelText('Precio')).toHaveValue('9.50');
  });
  it('creates employee using person fields only', async () => {
    await setup(`${base}/employees`);
    await click('Crear empleado');
    await userEvent.type(screen.getByLabelText('Nombres'), 'María');
    await userEvent.type(screen.getByLabelText('Apellidos'), 'Paz');
    await click('Guardar');
    await screen.findByRole('heading', { name: 'María Paz' });
    expect(bodyOf(`/api/businesses/${bid}/employees`, 'POST')).toEqual({
      firstName: 'María',
      lastName: 'Paz',
      email: null,
      phone: null,
    });
  });
  it('assigns and removes active service', async () => {
    await setup(`${base}/employees`);
    await click('Asignar Corte');
    await click('Quitar Corte');
    await screen.findByText('Sin servicios asignados.');
    expect(calls(`/api/employees/${eid}/services/${sid}`, 'POST')).toHaveLength(
      1,
    );
    expect(
      calls(`/api/employees/${eid}/services/${sid}`, 'DELETE'),
    ).toHaveLength(1);
  });
  it('keeps inactive assignments visible and removable', async () => {
    services[0]!.active = false;
    employees[0]!.services = [{ ...service, active: false }];
    await setup(`${base}/employees`);
    expect(await screen.findByText('Corte · Inactivo')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Asignar Corte' }),
    ).not.toBeInTheDocument();
    await click('Quitar Corte');
    await screen.findByText('Sin servicios asignados.');
  });
  it('reactivates an employee', async () => {
    employees[0]!.active = false;
    await setup(`${base}/employees`);
    await click('Reactivar Carlos Mora');
    await screen.findByRole('button', { name: 'Desactivar Carlos Mora' });
    expect(bodyOf(`/api/employees/${eid}`, 'PATCH')).toEqual({ active: true });
  });
});
describe('weekly schedules', () => {
  it('saves business week with opening and closing fields', async () => {
    await setup(`${base}/schedules`);
    await userEvent.click(await screen.findByLabelText('Lunes abierto'));
    await click('Guardar semana');
    await screen.findByText('Horario guardado.');
    expect(
      bodyOf(`/api/businesses/${bid}/schedules`, 'PUT').schedules[0],
    ).toEqual({
      dayOfWeek: 'MONDAY',
      active: true,
      openingTime: '09:00',
      closingTime: '18:00',
    });
  });
  it('saves employee week with start and end fields', async () => {
    await setup(`${base}/schedules`);
    await userEvent.selectOptions(
      await screen.findByLabelText('Editar horario de'),
      eid,
    );
    await userEvent.click(await screen.findByLabelText('Lunes abierto'));
    await click('Guardar semana');
    await screen.findByText('Horario guardado.');
    expect(
      bodyOf(`/api/employees/${eid}/schedules`, 'PUT').schedules[0],
    ).toEqual({
      dayOfWeek: 'MONDAY',
      active: true,
      startTime: '09:00',
      endTime: '18:00',
    });
  });
  it('rejects overnight hours before request', async () => {
    await setup(`${base}/schedules`);
    await userEvent.click(await screen.findByLabelText('Lunes abierto'));
    fireEvent.change(screen.getByLabelText('Cierre Lunes'), {
      target: { value: '08:00' },
    });
    await click('Guardar semana');
    expect(await screen.findByRole('alert')).toHaveTextContent('posterior');
    expect(calls(`/api/businesses/${bid}/schedules`, 'PUT')).toHaveLength(0);
  });
  it('shows schedule conflict without losing draft', async () => {
    conflict = true;
    await setup(`${base}/schedules`);
    await userEvent.click(await screen.findByLabelText('Lunes abierto'));
    await click('Guardar semana');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'dentro de la apertura',
    );
    expect(screen.getByLabelText('Lunes abierto')).toBeChecked();
  });
  it('never overwrites hidden inactive employee schedules', async () => {
    employees[0]!.active = false;
    await setup(`${base}/schedules`);
    await userEvent.selectOptions(
      await screen.findByLabelText('Editar horario de'),
      eid,
    );
    expect(
      await screen.findByText(/Activa el empleado para consultar/),
    ).toBeVisible();
    expect(calls(`/api/employees/${eid}/schedules`)).toHaveLength(0);
  });
});
describe('owner appointments', () => {
  it.each([
    'PENDING',
    'CONFIRMED',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ] as Status[])('shows only valid actions for %s', async (status) => {
    appointments[0]!.status = status;
    await setup(`${base}/appointments`);
    const card = (
      await screen.findByRole('heading', { name: 'Corte' })
    ).closest('.card')! as HTMLElement;
    expect(within(card).getByText(statusLabels[status])).toBeVisible();
    const expected =
      status === 'PENDING'
        ? ['Confirmar', 'Cancelar']
        : status === 'CONFIRMED'
          ? ['Completar', 'Cancelar', 'Marcar no asistencia']
          : [];
    expect(
      within(card)
        .queryAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(expected);
  });
  it('updates status and refreshes owner list', async () => {
    await setup(`${base}/appointments`);
    await click('Confirmar');
    await screen.findByRole('button', { name: 'Completar' });
    expect(bodyOf(`/api/appointments/${aid}/status`, 'PATCH')).toEqual({
      status: 'CONFIRMED',
    });
    expect(calls(`/api/businesses/${bid}/appointments`).length).toBeGreaterThan(
      1,
    );
  });
  it('requires confirmation for cancellation', async () => {
    await setup(`${base}/appointments`);
    await click('Cancelar');
    expect(calls(`/api/appointments/${aid}/status`, 'PATCH')).toHaveLength(0);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancelar',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Confirmar' }),
      ).not.toBeInTheDocument(),
    );
    expect(appointments[0]!.status).toBe('CANCELLED');
  });
  it('refreshes after concurrent status conflict', async () => {
    conflict = true;
    await setup(`${base}/appointments`);
    await click('Confirmar');
    expect(await screen.findByRole('alert')).toBeVisible();
    await waitFor(() =>
      expect(
        calls(`/api/businesses/${bid}/appointments`).length,
      ).toBeGreaterThan(1),
    );
  });
  it('sends date, status and pagination filters', async () => {
    await setup(`${base}/appointments`);
    await screen.findByRole('heading', { name: 'Corte' });
    fireEvent.change(screen.getByLabelText('Fecha'), {
      target: { value: '2099-10-15' },
    });
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'PENDING');
    await click('Filtrar');
    await waitFor(() =>
      expect(
        calls(`/api/businesses/${bid}/appointments`).at(-1)?.[0],
      ).toContain('date=2099-10-15'),
    );
    await click('Siguiente');
    await waitFor(() =>
      expect(
        calls(`/api/businesses/${bid}/appointments`).at(-1)?.[0],
      ).toContain('page=2'),
    );
  });
});
describe('contracts', () => {
  it.each(['0', '-15', '30.5'])(
    'rejects invalid duration %s',
    (durationMinutes) =>
      expect(
        fieldsSchema('service').safeParse({
          name: 'Corte',
          description: '',
          price: '8.00',
          durationMinutes,
        }).success,
      ).toBe(false),
  );
  it('strips unsafe business fields and preserves decimal text', () => {
    expect(
      formBody('service', {
        name: 'Corte',
        price: '0.10',
        durationMinutes: '30',
        businessId: 'foreign',
      }),
    ).toEqual({
      name: 'Corte',
      description: null,
      price: '0.10',
      durationMinutes: 30,
    });
  });
  it('requires exact times and supports closed days', () => {
    const week = {
      days: days.map((dayOfWeek) => ({
        dayOfWeek,
        active: false,
        start: '09:00',
        end: '09:00',
      })),
    };
    expect(weekSchema.safeParse(week).success).toBe(true);
    expect(scheduleBody(week, true).schedules[0]).not.toHaveProperty(
      'openingTime',
    );
  });
  it('allows owner deep links but rejects external or arbitrary routes', () => {
    expect(safeReturnTo({ returnTo: `${base}/schedules` })).toBe(
      `${base}/schedules`,
    );
    expect(safeReturnTo({ returnTo: '//evil.test' })).toBeNull();
    expect(safeReturnTo({ returnTo: `${base}/admin` })).toBeNull();
  });
});
