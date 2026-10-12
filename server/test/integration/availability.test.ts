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
let businessId: string;
let serviceId: string;
let employeeId: string;
let foreignBusinessId: string;
let foreignEmployeeId: string;
let foreignServiceId: string;
const date = '2030-01-07';
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
function query(overrides: Record<string, string> = {}) {
  return (
    '/api/availability?' +
    new URLSearchParams({
      businessId,
      serviceId,
      employeeId,
      date,
      ...overrides,
    })
  );
}
async function result(overrides: Record<string, string> = {}) {
  const r = await request(query(overrides));
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()).data;
}
async function status(
  expected: number,
  overrides: Record<string, string> = {},
) {
  const r = await request(query(overrides));
  assert.equal(r.status, expected, await r.text());
}
async function appointment(
  startTime: string,
  endTime: string,
  status:
    'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' = 'PENDING',
  eid = employeeId,
  sid = serviceId,
  bid = businessId,
) {
  return prisma.appointment.create({
    data: {
      customerId: owner.user.id,
      businessId: bid,
      employeeId: eid,
      serviceId: sid,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      priceAtBooking: '8.00',
      status,
    },
  });
}
before(async () => {
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const email = 'availability-owner@example.test';
  const password = 'Password123!';
  assert.equal(
    (
      await request('/api/auth/register', 'POST', undefined, {
        firstName: 'Availability',
        lastName: 'Test',
        email,
        password,
      })
    ).status,
    201,
  );
  owner = sessionSchema.parse(
    await (
      await request('/api/auth/login', 'POST', undefined, { email, password })
    ).json(),
  );
  businessId = idSchema.parse(
    await (
      await request('/api/businesses', 'POST', owner.accessToken, {
        name: 'Availability',
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
        { name: 'Corte', price: '8.00', durationMinutes: 30 },
      )
    ).json(),
  ).data.id;
  foreignBusinessId = (
    await prisma.business.create({
      data: { ownerId: owner.user.id, name: 'Other' },
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
    data: { active: true, durationMinutes: 30 },
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
      closingTime: 720,
    },
  });
  await prisma.employeeSchedule.create({
    data: { employeeId, dayOfWeek: 'MONDAY', startTime: 540, endTime: 720 },
  });
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('public endpoint returns ordered quarter-hour slots and exact response fields', async () => {
  const data = await result();
  assert.equal(data.date, date);
  assert.equal(data.durationMinutes, 30);
  assert.equal(data.slots.length, 11);
  assert.deepEqual(data.slots[0], { startTime: '09:00', endTime: '09:30' });
  assert.deepEqual(data.slots[1], { startTime: '09:15', endTime: '09:45' });
  assert.deepEqual(data.slots.at(-1), { startTime: '11:30', endTime: '12:00' });
  assert.deepEqual(Object.keys(data).sort(), [
    'businessId',
    'date',
    'durationMinutes',
    'employeeId',
    'serviceId',
    'slots',
  ]);
  const response = await request(query());
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('missing business returns 404', async () => {
  await status(404, { businessId: randomUUID() });
});
test('inactive business returns 404', async () => {
  await prisma.business.update({
    where: { id: businessId },
    data: { active: false },
  });
  await status(404);
});
test('inactive or missing service returns 404', async () => {
  await status(404, { serviceId: randomUUID() });
  await prisma.service.update({
    where: { id: serviceId },
    data: { active: false },
  });
  await status(404);
});
test('inactive or missing employee returns 404', async () => {
  await status(404, { employeeId: randomUUID() });
  await prisma.employee.update({
    where: { id: employeeId },
    data: { active: false },
  });
  await status(404);
});
test('foreign service returns 400', async () => {
  await status(400, { serviceId: foreignServiceId });
});
test('foreign employee returns 400', async () => {
  await status(400, { employeeId: foreignEmployeeId });
});
test('unassigned service returns 400', async () => {
  await prisma.employeeService.delete({
    where: { employeeId_serviceId: { employeeId, serviceId } },
  });
  await status(400);
});
test('closed or unconfigured business day returns empty slots', async () => {
  await prisma.businessSchedule.updateMany({
    where: { businessId },
    data: { active: false },
  });
  assert.deepEqual((await result()).slots, []);
  await prisma.businessSchedule.deleteMany({ where: { businessId } });
  assert.deepEqual((await result()).slots, []);
});
test('employee non-working or unconfigured day returns empty slots', async () => {
  await prisma.employeeSchedule.updateMany({
    where: { employeeId },
    data: { active: false },
  });
  assert.deepEqual((await result()).slots, []);
  await prisma.employeeSchedule.deleteMany({ where: { employeeId } });
  assert.deepEqual((await result()).slots, []);
});
test('inconsistent schedules are rejected instead of offering out-of-range time', async () => {
  await prisma.employeeSchedule.updateMany({
    where: { employeeId },
    data: { startTime: 480 },
  });
  await status(409);
  await prisma.employeeSchedule.updateMany({
    where: { employeeId },
    data: { startTime: 540, endTime: 780 },
  });
  await status(409);
});
test('one-hour service fits exactly and ninety-minute service does not', async () => {
  await prisma.employeeSchedule.updateMany({
    where: { employeeId },
    data: { endTime: 600 },
  });
  await prisma.service.update({
    where: { id: serviceId },
    data: { durationMinutes: 60 },
  });
  assert.deepEqual((await result()).slots, [
    { startTime: '09:00', endTime: '10:00' },
  ]);
  await prisma.service.update({
    where: { id: serviceId },
    data: { durationMinutes: 90 },
  });
  assert.deepEqual((await result()).slots, []);
});
for (const state of ['PENDING', 'CONFIRMED'] as const)
  test(
    state + ' blocks exact and partial overlaps but allows adjacent slots',
    async () => {
      await appointment('2030-01-07T15:00:00Z', '2030-01-07T15:30:00Z', state);
      const starts = (await result()).slots.map(
        (s: { startTime: string }) => s.startTime,
      );
      for (const time of ['09:45', '10:00', '10:15'])
        assert.ok(!starts.includes(time));
      assert.ok(starts.includes('09:30'));
      assert.ok(starts.includes('10:30'));
    },
  );
for (const state of ['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const)
  test(state + ' does not block future availability', async () => {
    await appointment('2030-01-07T15:00:00Z', '2030-01-07T15:30:00Z', state);
    assert.equal((await result()).slots.length, 11);
  });
test('appointments crossing local midnight are included even when they start the previous day', async () => {
  await appointment('2030-01-07T04:30:00Z', '2030-01-07T14:15:00Z');
  assert.equal((await result()).slots[0].startTime, '09:15');
});
test('appointments of another service still block this employee and other employees do not', async () => {
  const alternative = await prisma.service.create({
    data: {
      businessId,
      name: 'Another service',
      price: '10',
      durationMinutes: 30,
    },
  });
  await appointment(
    '2030-01-07T15:00:00Z',
    '2030-01-07T15:30:00Z',
    'PENDING',
    employeeId,
    alternative.id,
  );
  await appointment(
    '2030-01-07T14:00:00Z',
    '2030-01-07T14:30:00Z',
    'PENDING',
    foreignEmployeeId,
    foreignServiceId,
    foreignBusinessId,
  );
  const starts = (await result()).slots.map(
    (s: { startTime: string }) => s.startTime,
  );
  assert.ok(starts.includes('09:00'));
  assert.ok(!starts.includes('10:00'));
});
test('past local date returns 400 and today excludes starts already passed including seconds', async () => {
  now = new Date('2030-01-07T14:15:01Z');
  await status(400, { date: '2030-01-06' });
  assert.equal((await result()).slots[0].startTime, '09:30');
  now = new Date('2030-01-07T14:15:00Z');
  assert.equal((await result()).slots[0].startTime, '09:15');
});
test('today and weekday are evaluated in business timezone instead of UTC', async () => {
  now = new Date('2030-01-08T02:00:00Z');
  await prisma.businessSchedule.updateMany({
    where: { businessId },
    data: { openingTime: 1260, closingTime: 1380 },
  });
  await prisma.employeeSchedule.updateMany({
    where: { employeeId },
    data: { startTime: 1260, endTime: 1380 },
  });
  assert.equal((await result()).slots[0].startTime, '21:00');
  await prisma.business.update({
    where: { id: businessId },
    data: { timeZone: 'Pacific/Kiritimati' },
  });
  await status(400);
});
test('non-integer timezone offset converts appointments correctly', async () => {
  await prisma.business.update({
    where: { id: businessId },
    data: { timeZone: 'Asia/Kathmandu' },
  });
  await appointment('2030-01-07T03:15:00Z', '2030-01-07T03:45:00Z');
  assert.equal((await result()).slots[0].startTime, '09:30');
});
test('invalid dates, missing IDs, duplicate query keys and unknown fields return 400', async () => {
  for (const value of [
    '2030-02-30',
    '2030-02-29',
    '2030-13-01',
    '2030-1-07',
    '07-01-2030',
    '2030-01-07T00:00:00Z',
    '0000-01-01',
    'abc',
    '',
  ])
    await status(400, { date: value });
  for (const key of ['businessId', 'serviceId', 'employeeId'])
    await status(400, { [key]: 'invalid' });
  assert.equal((await request('/api/availability')).status, 400);
  assert.equal((await request(query() + '&date=' + date)).status, 400);
  assert.equal((await request(query() + '&unknown=value')).status, 400);
});
test('invalid persisted time zone returns a controlled error', async () => {
  await prisma.business.update({
    where: { id: businessId },
    data: { timeZone: 'Invalid/Zone' },
  });
  await status(409);
});
test('database exclusion agrees with blocking states and preserves overlap protection', async () => {
  const completed = await appointment(
    '2030-01-07T15:00:00Z',
    '2030-01-07T15:30:00Z',
    'COMPLETED',
  );
  const pending = await appointment(
    '2030-01-07T15:00:00Z',
    '2030-01-07T15:30:00Z',
    'PENDING',
  );
  await assert.rejects(
    appointment('2030-01-07T15:15:00Z', '2030-01-07T15:45:00Z', 'CONFIRMED'),
  );
  await assert.rejects(
    prisma.appointment.update({
      where: { id: completed.id },
      data: { status: 'CONFIRMED' },
    }),
  );
  await prisma.appointment.update({
    where: { id: pending.id },
    data: { status: 'CANCELLED' },
  });
  assert.equal((await result()).slots.length, 11);
  assert.equal((await request('/api/health')).status, 200);
  assert.equal(
    (await request('/api/auth/me', 'GET', owner.accessToken)).status,
    200,
  );
});
