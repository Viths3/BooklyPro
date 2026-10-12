import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { prisma, checkDatabase } from '../../src/config/prisma.js';
import { env } from '../../src/config/env.js';
import { AuthRepository } from '../../src/repositories/auth.repository.js';
import { AuthService } from '../../src/services/auth.service.js';
import { createAuthRouter } from '../../src/routes/auth.routes.js';
import { BusinessRepository } from '../../src/repositories/business.repository.js';
import { BusinessService } from '../../src/services/business.service.js';
import { createBusinessRouter } from '../../src/routes/business.routes.js';
import { ServiceRepository } from '../../src/repositories/service.repository.js';
import { ServiceService } from '../../src/services/service.service.js';
import { createServiceRouter } from '../../src/routes/service.routes.js';

import { EmployeeRepository } from '../../src/repositories/employee.repository.js';
import { EmployeeService } from '../../src/services/employee.service.js';
import { createEmployeeRouter } from '../../src/routes/employee.routes.js';
import { ScheduleRepository } from '../../src/repositories/schedule.repository.js';
import { ScheduleService } from '../../src/services/schedule.service.js';
import { createScheduleRouter } from '../../src/routes/schedule.routes.js';
import { AvailabilityRepository } from '../../src/repositories/availability.repository.js';
import { AvailabilityService } from '../../src/services/availability.service.js';
import { createAvailabilityRouter } from '../../src/routes/availability.routes.js';
let now = new Date('2030-01-06T12:00:00Z');
import { AppointmentRepository } from '../../src/repositories/appointment.repository.js';
import { AppointmentService } from '../../src/services/appointment.service.js';
import { createAppointmentRouter } from '../../src/routes/appointment.routes.js';
const dbUrl = new URL(env.DATABASE_URL);
if (
  env.NODE_ENV !== 'test' ||
  !/^\/booklypro_test_[a-f0-9]{16}$/.test(dbUrl.pathname) ||
  !['localhost', '127.0.0.1'].includes(dbUrl.hostname)
) {
  throw new Error(
    'Tests require an isolated local database created by test:integration',
  );
}
const auth = new AuthService(new AuthRepository(prisma));
const app = createApp(checkDatabase, {
  auth: createAuthRouter(auth),
  appointments: createAppointmentRouter(
    new AppointmentService(
      new AppointmentRepository(prisma),
      new AvailabilityService(
        new AvailabilityRepository(prisma),
        15,
        () => now,
      ),
    ),
    auth,
  ),
  availability: createAvailabilityRouter(
    new AvailabilityService(new AvailabilityRepository(prisma), 15, () => now),
  ),
  schedules: createScheduleRouter(
    new ScheduleService(new ScheduleRepository(prisma)),
    auth,
  ),
  employees: createEmployeeRouter(
    new EmployeeService(new EmployeeRepository(prisma)),
    auth,
  ),
  businesses: createBusinessRouter(
    new BusinessService(new BusinessRepository(prisma)),
    auth,
  ),
  services: createServiceRouter(
    new ServiceService(new ServiceRepository(prisma)),
    auth,
  ),
});
const server = app.listen(0, '127.0.0.1');
const sessionSchema = z
  .object({
    data: z.object({
      accessToken: z.string(),
      user: z.object({ id: z.uuid() }),
    }),
  })
  .transform((value) => value.data);
const idSchema = z.object({ data: z.object({ id: z.uuid() }) });
let base: string;
let owner: z.infer<typeof sessionSchema>;
let customer: z.infer<typeof sessionSchema>;
let stranger: z.infer<typeof sessionSchema>;
let businessId: string;
let employeeId: string;
let serviceId: string;
let foreignBusinessId: string;
let foreignEmployeeId: string;
let foreignServiceId: string;
const date = '2030-01-07';
function input(extra: Record<string, unknown> = {}) {
  return {
    businessId,
    employeeId,
    serviceId,
    date,
    startTime: '10:00',
    notes: 'Primera visita',
    ...extra,
  };
}
function request(path: string, method = 'GET', token?: string, body?: unknown) {
  return fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  assert.deepEqual(Object.keys(body), ['error']);
  assert.ok(
    !JSON.stringify(body).match(
      /passwordHash|stack|P2002|23P01|postgresql:\/\//,
    ),
  );
  return body.error;
}
async function account(email: string) {
  assert.equal(
    (
      await request('/api/auth/register', 'POST', undefined, {
        firstName: 'Appointment',
        lastName: 'Test',
        email,
        password: 'Password123!',
      })
    ).status,
    201,
  );
  return sessionSchema.parse(
    await (
      await request('/api/auth/login', 'POST', undefined, {
        email,
        password: 'Password123!',
      })
    ).json(),
  );
}
async function create(
  extra: Record<string, unknown> = {},
  token = customer.accessToken,
) {
  const response = await request(
    '/api/appointments',
    'POST',
    token,
    input(extra),
  );
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()).data;
}
const path = (id: string) => '/api/appointments/' + id;
async function setState(
  id: string,
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
) {
  await prisma.appointment.update({ where: { id }, data: { status } });
}
async function starts() {
  const r = await request(
    '/api/availability?' +
      new URLSearchParams({ businessId, employeeId, serviceId, date }),
  );
  assert.equal(r.status, 200);
  return (await r.json()).data.slots.map(
    (s: { startTime: string }) => s.startTime,
  );
}
before(async () => {
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  owner = await account('appointments-owner@example.test');
  customer = await account('appointments-customer@example.test');
  stranger = await account('appointments-stranger@example.test');
  businessId = idSchema.parse(
    await (
      await request('/api/businesses', 'POST', owner.accessToken, {
        name: 'Appointments',
      })
    ).json(),
  ).data.id;
  employeeId = idSchema.parse(
    await (
      await request(
        '/api/businesses/' + businessId + '/employees',
        'POST',
        owner.accessToken,
        { firstName: 'Carlos', lastName: 'Mora' },
      )
    ).json(),
  ).data.id;
  serviceId = idSchema.parse(
    await (
      await request(
        '/api/businesses/' + businessId + '/services',
        'POST',
        owner.accessToken,
        { name: 'Corte', price: '8.10', durationMinutes: 30 },
      )
    ).json(),
  ).data.id;
  foreignBusinessId = (
    await prisma.business.create({
      data: { ownerId: stranger.user.id, name: 'Other' },
    })
  ).id;
  foreignEmployeeId = (
    await prisma.employee.create({
      data: {
        businessId: foreignBusinessId,
        firstName: 'Other',
        lastName: 'Employee',
      },
    })
  ).id;
  foreignServiceId = (
    await prisma.service.create({
      data: {
        businessId: foreignBusinessId,
        name: 'Other',
        price: '8',
        durationMinutes: 30,
      },
    })
  ).id;
});
beforeEach(async () => {
  now = new Date('2030-01-06T12:00:00Z');
  await prisma.appointment.deleteMany();
  await prisma.business.update({
    where: { id: businessId },
    data: { active: true, timeZone: 'America/Guayaquil' },
  });
  await prisma.employee.update({
    where: { id: employeeId },
    data: { active: true },
  });
  await prisma.service.update({
    where: { id: serviceId },
    data: { active: true, durationMinutes: 30, price: '8.10' },
  });
  await prisma.employeeService.upsert({
    where: { employeeId_serviceId: { employeeId, serviceId } },
    create: { employeeId, serviceId, businessId },
    update: {},
  });
  await prisma.businessSchedule.deleteMany({ where: { businessId } });
  await prisma.employeeSchedule.deleteMany({ where: { employeeId } });
  await prisma.businessSchedule.create({
    data: {
      businessId,
      dayOfWeek: 'MONDAY',
      openingTime: 540,
      closingTime: 1080,
    },
  });
  await prisma.employeeSchedule.create({
    data: { employeeId, dayOfWeek: 'MONDAY', startTime: 600, endTime: 1020 },
  });
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('creation returns data, 201, Location, authenticated customer, UTC timestamps and exact booked price', async () => {
  const r = await request(
    '/api/appointments',
    'POST',
    customer.accessToken,
    input(),
  );
  assert.equal(r.status, 201);
  const { data } = await r.json();
  assert.equal(r.headers.get('location'), path(data.id));
  assert.equal(data.customerId, customer.user.id);
  assert.equal(data.status, 'PENDING');
  assert.equal(data.startTime, '2030-01-07T15:00:00.000Z');
  assert.equal(data.endTime, '2030-01-07T15:30:00.000Z');
  assert.equal(data.priceAtBooking, '8.10');
  assert.equal(data.service.price, '8.10');
  assert.equal(data.notes, 'Primera visita');
  assert.ok(
    !JSON.stringify(data).match(
      /passwordHash|refreshToken|ownerId|email|phone/,
    ),
  );
  const stored = await prisma.appointment.findUniqueOrThrow({
    where: { id: data.id },
  });
  assert.equal(stored.customerId, customer.user.id);
});
test('every appointment endpoint requires authentication and standardized 401', async () => {
  const id = randomUUID();
  for (const [url, method] of [
    ['/api/appointments', 'POST'],
    ['/api/appointments/me', 'GET'],
    [path(id), 'GET'],
    [path(id) + '/cancel', 'PATCH'],
    [path(id) + '/status', 'PATCH'],
    ['/api/businesses/' + businessId + '/appointments', 'GET'],
  ])
    await error(await request(url!, method), 401, 'UNAUTHORIZED');
});
test('creation rejects injected internal fields and invalid date time notes or IDs', async () => {
  for (const extra of [
    { customerId: stranger.user.id },
    { endTime: '12:00' },
    { status: 'CONFIRMED' },
    { id: randomUUID() },
    { priceAtBooking: '0.00' },
    { createdAt: '2030-01-01' },
    { businessId: 'invalid' },
    { date: '2030-02-30' },
    { startTime: '9:00' },
    { startTime: '24:00' },
    { notes: 'x'.repeat(501) },
  ]) {
    const e = await error(
      await request(
        '/api/appointments',
        'POST',
        customer.accessToken,
        input(extra),
      ),
      400,
      'VALIDATION_ERROR',
    );
    assert.ok(e.details.length > 0);
    assert.equal(typeof e.details[0].field, 'string');
  }
  assert.equal(await prisma.appointment.count(), 0);
});
for (const [field, code] of [
  ['businessId', 'BUSINESS_NOT_FOUND'],
  ['serviceId', 'SERVICE_NOT_FOUND'],
  ['employeeId', 'EMPLOYEE_NOT_FOUND'],
])
  test('missing ' + field + ' returns domain 404', async () => {
    await error(
      await request(
        '/api/appointments',
        'POST',
        customer.accessToken,
        input({ [field!]: randomUUID() }),
      ),
      404,
      code!,
    );
  });
for (const entity of ['business', 'service', 'employee'] as const)
  test('inactive ' + entity + ' cannot be booked', async () => {
    if (entity === 'business')
      await prisma.business.update({
        where: { id: businessId },
        data: { active: false },
      });
    if (entity === 'service')
      await prisma.service.update({
        where: { id: serviceId },
        data: { active: false },
      });
    if (entity === 'employee')
      await prisma.employee.update({
        where: { id: employeeId },
        data: { active: false },
      });
    await error(
      await request('/api/appointments', 'POST', customer.accessToken, input()),
      404,
      entity.toUpperCase() + '_INACTIVE',
    );
  });
test('foreign service or employee cannot be booked through this business', async () => {
  for (const extra of [
    { serviceId: foreignServiceId },
    { employeeId: foreignEmployeeId },
  ])
    await error(
      await request(
        '/api/appointments',
        'POST',
        customer.accessToken,
        input(extra),
      ),
      400,
      'INVALID_APPOINTMENT_DATA',
    );
});
test('employee must offer the service', async () => {
  await prisma.employeeService.delete({
    where: { employeeId_serviceId: { employeeId, serviceId } },
  });
  await error(
    await request('/api/appointments', 'POST', customer.accessToken, input()),
    400,
    'SERVICE_NOT_ASSIGNED_TO_EMPLOYEE',
  );
});
test('business hours employee hours closing bound and slot grid are enforced', async () => {
  for (const startTime of ['08:00', '09:30', '16:45', '17:30', '10:07'])
    await error(
      await request(
        '/api/appointments',
        'POST',
        customer.accessToken,
        input({ startTime }),
      ),
      409,
      'APPOINTMENT_SLOT_UNAVAILABLE',
    );
  await prisma.businessSchedule.updateMany({
    where: { businessId },
    data: { active: false },
  });
  await error(
    await request('/api/appointments', 'POST', customer.accessToken, input()),
    409,
    'APPOINTMENT_SLOT_UNAVAILABLE',
  );
});
test('past dates and starts earlier than now are rejected', async () => {
  now = new Date('2030-01-07T15:00:01Z');
  await error(
    await request(
      '/api/appointments',
      'POST',
      customer.accessToken,
      input({ date: '2030-01-06' }),
    ),
    400,
    'INVALID_DATE',
  );
  await error(
    await request('/api/appointments', 'POST', customer.accessToken, input()),
    409,
    'APPOINTMENT_SLOT_UNAVAILABLE',
  );
});
test('duration and fractional timezone offset determine endTime without server timezone', async () => {
  await prisma.business.update({
    where: { id: businessId },
    data: { timeZone: 'Asia/Kathmandu' },
  });
  await prisma.service.update({
    where: { id: serviceId },
    data: { durationMinutes: 45 },
  });
  const data = await create();
  assert.equal(data.startTime, '2030-01-07T04:15:00.000Z');
  assert.equal(data.endTime, '2030-01-07T05:00:00.000Z');
});
for (const state of ['PENDING', 'CONFIRMED'] as const)
  test(
    state + ' blocks partial and exact overlaps while adjacency is allowed',
    async () => {
      const data = await create({ startTime: '11:00' });
      await setState(data.id, state);
      for (const startTime of ['10:45', '11:00', '11:15'])
        await error(
          await request(
            '/api/appointments',
            'POST',
            customer.accessToken,
            input({ startTime }),
          ),
          409,
          'APPOINTMENT_SLOT_UNAVAILABLE',
        );
      await create({ startTime: '10:30' });
      await create({ startTime: '11:30' });
    },
  );
for (const state of ['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const)
  test(
    state + ' releases slot while preserving appointment history',
    async () => {
      const data = await create();
      await setState(data.id, state);
      assert.ok((await starts()).includes('10:00'));
      await create();
      assert.equal(await prisma.appointment.count(), 2);
    },
  );
test('booked price remains immutable when service catalog price changes', async () => {
  const data = await create();
  await prisma.service.update({
    where: { id: serviceId },
    data: { price: '19.99' },
  });
  const row = (
    await (await request(path(data.id), 'GET', customer.accessToken)).json()
  ).data;
  assert.equal(row.priceAtBooking, '8.10');
  assert.equal(row.service.price, '19.99');
});
test('me returns only own appointments with filtering ordering and pagination', async () => {
  const first = await create();
  await create({ startTime: '11:00' });
  await create({ startTime: '12:00' }, stranger.accessToken);
  const r = await request(
    '/api/appointments/me?page=1&limit=1',
    'GET',
    customer.accessToken,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, first.id);
  assert.deepEqual(body.pagination, {
    page: 1,
    limit: 1,
    total: 2,
    totalPages: 2,
  });
  const filtered = await request(
    '/api/appointments/me?from=2030-01-07T16:00:00Z&to=2030-01-07T17:00:00Z&status=PENDING',
    'GET',
    customer.accessToken,
  );
  assert.equal((await filtered.json()).data.length, 1);
  await error(
    await request(
      '/api/appointments/me?customerId=' + stranger.user.id,
      'GET',
      customer.accessToken,
    ),
    400,
    'VALIDATION_ERROR',
  );
});
test('detail is limited to customer or business owner without ADMIN bypass', async () => {
  const data = await create();
  for (const token of [customer.accessToken, owner.accessToken])
    assert.equal((await request(path(data.id), 'GET', token)).status, 200);
  await error(
    await request(path(data.id), 'GET', stranger.accessToken),
    403,
    'FORBIDDEN',
  );
  await prisma.user.update({
    where: { id: stranger.user.id },
    data: { role: 'ADMIN' },
  });
  await error(
    await request(path(data.id), 'GET', stranger.accessToken),
    403,
    'FORBIDDEN',
  );
  await error(
    await request(path(randomUUID()), 'GET', customer.accessToken),
    404,
    'APPOINTMENT_NOT_FOUND',
  );
});
for (const initial of ['PENDING', 'CONFIRMED'] as const)
  test(
    'customer cancels ' + initial + ' idempotently and availability reopens',
    async () => {
      const data = await create();
      await setState(data.id, initial);
      assert.ok(!(await starts()).includes('10:00'));
      for (let i = 0; i < 2; i++) {
        const r = await request(
          path(data.id) + '/cancel',
          'PATCH',
          customer.accessToken,
        );
        assert.equal(r.status, 200);
        assert.equal((await r.json()).data.status, 'CANCELLED');
      }
      assert.ok((await starts()).includes('10:00'));
      assert.equal(await prisma.appointment.count(), 1);
    },
  );
test('customer cannot cancel another customer appointment and owner uses status endpoint', async () => {
  const data = await create();
  for (const token of [stranger.accessToken, owner.accessToken])
    await error(
      await request(path(data.id) + '/cancel', 'PATCH', token),
      403,
      'FORBIDDEN',
    );
});
for (const target of ['CONFIRMED', 'COMPLETED', 'NO_SHOW'])
  test('customer cannot administratively set ' + target, async () => {
    const data = await create();
    await error(
      await request(path(data.id) + '/status', 'PATCH', customer.accessToken, {
        status: target,
      }),
      403,
      'FORBIDDEN',
    );
  });
test('owner lists only own business appointments with local date and filters', async () => {
  await create();
  await create({ startTime: '11:00' });
  const url = '/api/businesses/' + businessId + '/appointments';
  const r = await request(
    url +
      '?date=' +
      date +
      '&employeeId=' +
      employeeId +
      '&serviceId=' +
      serviceId +
      '&status=PENDING&limit=1',
    'GET',
    owner.accessToken,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.pagination.total, 2);
  assert.equal(body.data.length, 1);
  await error(
    await request(url, 'GET', stranger.accessToken),
    403,
    'FORBIDDEN',
  );
  await error(
    await request(url, 'GET', customer.accessToken),
    403,
    'FORBIDDEN',
  );
  assert.equal(
    (
      await (
        await request(url + '?date=2030-01-08', 'GET', owner.accessToken)
      ).json()
    ).pagination.total,
    0,
  );
});
const transitions = [
  ['PENDING', 'CONFIRMED'],
  ['PENDING', 'CANCELLED'],
  ['CONFIRMED', 'COMPLETED'],
  ['CONFIRMED', 'CANCELLED'],
  ['CONFIRMED', 'NO_SHOW'],
] as const;
for (const [initial, target] of transitions)
  test('owner transition ' + initial + ' to ' + target, async () => {
    const data = await create();
    await setState(data.id, initial);
    const r = await request(
      path(data.id) + '/status',
      'PATCH',
      owner.accessToken,
      { status: target },
    );
    assert.equal(r.status, 200);
    assert.equal((await r.json()).data.status, target);
    if (target === 'CONFIRMED')
      assert.equal(
        (
          await request(path(data.id) + '/status', 'PATCH', owner.accessToken, {
            status: target,
          })
        ).status,
        200,
      );
  });
for (const target of ['COMPLETED', 'NO_SHOW', 'PENDING'])
  test('PENDING to ' + target + ' is rejected', async () => {
    const data = await create();
    await error(
      await request(path(data.id) + '/status', 'PATCH', owner.accessToken, {
        status: target,
      }),
      409,
      'INVALID_APPOINTMENT_STATUS_TRANSITION',
    );
  });
for (const terminal of ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)
  test(terminal + ' is final', async () => {
    const data = await create();
    await setState(data.id, terminal);
    for (const status of [
      'PENDING',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ])
      await error(
        await request(path(data.id) + '/status', 'PATCH', owner.accessToken, {
          status,
        }),
        409,
        'INVALID_APPOINTMENT_STATUS_TRANSITION',
      );
    if (terminal !== 'CANCELLED')
      await error(
        await request(path(data.id) + '/cancel', 'PATCH', customer.accessToken),
        409,
        'INVALID_APPOINTMENT_STATUS_TRANSITION',
      );
  });
test('foreign owner cannot change appointment status', async () => {
  const data = await create();
  await error(
    await request(path(data.id) + '/status', 'PATCH', stranger.accessToken, {
      status: 'CONFIRMED',
    }),
    403,
    'FORBIDDEN',
  );
});
test('simultaneous reservations of the same slot produce one 201 and one 409', async () => {
  const responses = await Promise.all([
    request('/api/appointments', 'POST', customer.accessToken, input()),
    request('/api/appointments', 'POST', stranger.accessToken, input()),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  await error(
    responses.find((r) => r.status === 409)!,
    409,
    'APPOINTMENT_SLOT_UNAVAILABLE',
  );
  assert.equal(await prisma.appointment.count(), 1);
});
test('concurrent partial overlaps are rejected and adjacent reservations both succeed', async () => {
  const responses = await Promise.all(
    ['11:00', '11:15'].map((startTime) =>
      request(
        '/api/appointments',
        'POST',
        customer.accessToken,
        input({ startTime }),
      ),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const adjacent = await Promise.all(
    ['13:00', '13:30'].map((startTime) =>
      request(
        '/api/appointments',
        'POST',
        customer.accessToken,
        input({ startTime }),
      ),
    ),
  );
  assert.deepEqual(
    adjacent.map((r) => r.status),
    [201, 201],
  );
});
test('concurrent cancel and complete serialize and terminal state cannot be overwritten', async () => {
  const data = await create();
  await setState(data.id, 'CONFIRMED');
  const responses = await Promise.all([
    request(path(data.id) + '/cancel', 'PATCH', customer.accessToken),
    request(path(data.id) + '/status', 'PATCH', owner.accessToken, {
      status: 'COMPLETED',
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
});
test('simultaneous customer cancellations are idempotent', async () => {
  const data = await create();
  const responses = await Promise.all([
    request(path(data.id) + '/cancel', 'PATCH', customer.accessToken),
    request(path(data.id) + '/cancel', 'PATCH', customer.accessToken),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  );
});
test('database exclusion still rejects direct conflicting writes', async () => {
  const data = await create();
  const row = await prisma.appointment.findUniqueOrThrow({
    where: { id: data.id },
  });
  await assert.rejects(
    prisma.appointment.create({
      data: {
        businessId,
        employeeId,
        serviceId,
        customerId: customer.user.id,
        startTime: row.startTime,
        endTime: row.endTime,
        priceAtBooking: '8.10',
        status: 'PENDING',
      },
    }),
  );
});
test('PostgreSQL exclusion errors are mapped to a clean slot conflict', async () => {
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION test_appointment_conflict() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected exclusion conflict' USING ERRCODE = '23P01'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER test_appointment_conflict BEFORE INSERT ON "Appointment" FOR EACH ROW EXECUTE FUNCTION test_appointment_conflict()`,
  );
  try {
    await error(
      await request('/api/appointments', 'POST', customer.accessToken, input()),
      409,
      'APPOINTMENT_SLOT_UNAVAILABLE',
    );
    assert.equal(await prisma.appointment.count(), 0);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER test_appointment_conflict ON "Appointment"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION test_appointment_conflict()');
  }
});
test('bad filters IDs status and cancel payload return validation errors', async () => {
  const data = await create();
  for (const q of [
    'page=0',
    'limit=101',
    'page=1&page=2',
    'status=INVALID',
    'from=2030-01-07',
    'from=2030-01-08T00:00:00Z&to=2030-01-07T00:00:00Z',
  ])
    await error(
      await request('/api/appointments/me?' + q, 'GET', customer.accessToken),
      400,
      'VALIDATION_ERROR',
    );
  await error(
    await request(path(data.id) + '/status', 'PATCH', owner.accessToken, {
      status: 'INVALID',
    }),
    400,
    'VALIDATION_ERROR',
  );
  await error(
    await request(path(data.id) + '/cancel', 'PATCH', customer.accessToken, {
      status: 'CONFIRMED',
    }),
    400,
    'VALIDATION_ERROR',
  );
  await error(
    await request('/api/appointments/invalid', 'GET', customer.accessToken),
    400,
    'VALIDATION_ERROR',
  );
  await error(
    await request(
      '/api/businesses/' +
        businessId +
        '/appointments?date=' +
        date +
        '&from=2030-01-01T00:00:00Z',
      'GET',
      owner.accessToken,
    ),
    400,
    'VALIDATION_ERROR',
  );
});
test('inactive business retains customer and owner access to historical appointments', async () => {
  const data = await create();
  await prisma.business.update({
    where: { id: businessId },
    data: { active: false },
  });
  assert.equal(
    (await request(path(data.id), 'GET', customer.accessToken)).status,
    200,
  );
  assert.equal(
    (
      await request(
        '/api/businesses/' + businessId + '/appointments',
        'GET',
        owner.accessToken,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(path(data.id) + '/status', 'PATCH', owner.accessToken, {
        status: 'CANCELLED',
      })
    ).status,
    200,
  );
});
