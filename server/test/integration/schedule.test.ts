import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
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
const sessionSchema = z.object({
  accessToken: z.string(),
  user: z.object({ id: z.uuid() }),
});
const idSchema = z.object({ data: z.object({ id: z.uuid() }) });
let base: string;
let owner: z.infer<typeof sessionSchema>;
let other: z.infer<typeof sessionSchema>;
let businessId: string;
let employeeId: string;
const businessPath = () => '/api/businesses/' + businessId + '/schedules';
const employeePath = () => '/api/employees/' + employeeId + '/schedules';
const monday = {
  dayOfWeek: 'MONDAY',
  openingTime: '09:00',
  closingTime: '18:00',
  active: true,
};
const tuesday = { ...monday, dayOfWeek: 'TUESDAY' };
const sunday = {
  dayOfWeek: 'SUNDAY',
  openingTime: '00:00',
  closingTime: '00:00',
  active: false,
};
const work = {
  dayOfWeek: 'MONDAY',
  startTime: '10:00',
  endTime: '17:00',
  active: true,
};
const rest = {
  dayOfWeek: 'SUNDAY',
  startTime: '00:00',
  endTime: '00:00',
  active: false,
};
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
async function expectStatus(
  path: string,
  method: string,
  status: number,
  token?: string,
  body?: unknown,
) {
  const response = await request(path, method, token, body);
  assert.equal(response.status, status, await response.text());
}
async function read(path: string) {
  const response = await request(path);
  assert.equal(response.status, 200);
  return response.json();
}
async function account(email: string) {
  await expectStatus('/api/auth/register', 'POST', 201, undefined, {
    firstName: 'Schedule',
    lastName: 'Test',
    email,
    password: 'Password123!',
  });
  const response = await request('/api/auth/login', 'POST', undefined, {
    email,
    password: 'Password123!',
  });
  assert.equal(response.status, 200);
  return sessionSchema.parse(await response.json());
}
before(async () => {
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  owner = await account('schedule-owner@example.test');
  other = await account('schedule-other@example.test');
  const business = await request('/api/businesses', 'POST', owner.accessToken, {
    name: 'Schedules',
  });
  assert.equal(business.status, 201);
  businessId = idSchema.parse(await business.json()).data.id;
  const employee = await request(
    '/api/businesses/' + businessId + '/employees',
    'POST',
    owner.accessToken,
    { firstName: 'Carlos', lastName: 'Mora' },
  );
  assert.equal(employee.status, 201);
  employeeId = idSchema.parse(await employee.json()).data.id;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('public schedules distinguish unconfigured, missing and invalid entities', async () => {
  assert.deepEqual(await read(businessPath()), { data: [] });
  assert.deepEqual(await read(employeePath()), { data: [] });
  for (const kind of ['businesses', 'employees']) {
    await expectStatus(
      '/api/' + kind + '/' + randomUUID() + '/schedules',
      'GET',
      404,
    );
    await expectStatus('/api/' + kind + '/invalid/schedules', 'GET', 400);
  }
});
test('only authenticated users can configure or patch schedules', async () => {
  for (const path of [businessPath(), employeePath()]) {
    await expectStatus(path, 'PUT', 401, undefined, { schedules: [] });
    await expectStatus(path + '/MONDAY', 'PATCH', 401, undefined, {
      active: false,
    });
  }
});
test('another user cannot configure business or employee schedules', async () => {
  for (const path of [businessPath(), employeePath()]) {
    await expectStatus(path, 'PUT', 403, other.accessToken, { schedules: [] });
    await expectStatus(path + '/MONDAY', 'PATCH', 403, other.accessToken, {
      active: false,
    });
  }
});
test('owner sets complete business week and public output is ordered and safe', async () => {
  const response = await request(businessPath(), 'PUT', owner.accessToken, {
    schedules: [sunday, tuesday, monday],
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [monday, tuesday, sunday] });
  assert.deepEqual(await read(businessPath()), {
    data: [monday, tuesday, sunday],
  });
  const stored = await prisma.businessSchedule.findUniqueOrThrow({
    where: { businessId_dayOfWeek: { businessId, dayOfWeek: 'MONDAY' } },
  });
  assert.equal(stored.openingTime, 540);
  assert.equal(stored.closingTime, 1080);
});
test('closed day accepts zero interval and cannot be activated without valid times', async () => {
  await expectStatus(
    businessPath() + '/SUNDAY',
    'PATCH',
    400,
    owner.accessToken,
    { active: true },
  );
  const closed = await prisma.businessSchedule.findUniqueOrThrow({
    where: { businessId_dayOfWeek: { businessId, dayOfWeek: 'SUNDAY' } },
  });
  assert.equal(closed.active, false);
  assert.equal(closed.openingTime, 0);
  assert.equal(closed.closingTime, 0);
});
test('active equal, reversed and overnight intervals are rejected', async () => {
  for (const [start, end] of [
    ['09:00', '09:00'],
    ['18:00', '09:00'],
    ['23:00', '01:00'],
  ]) {
    await expectStatus(businessPath(), 'PUT', 400, owner.accessToken, {
      schedules: [{ ...monday, openingTime: start, closingTime: end }],
    });
    await expectStatus(employeePath(), 'PUT', 400, owner.accessToken, {
      schedules: [{ ...work, startTime: start, endTime: end }],
    });
  }
});
test('strict HH:mm rejects malformed time values and numeric minutes', async () => {
  for (const time of [
    '9:00',
    '25:00',
    '12:75',
    'abc',
    '24:00',
    '09:00:00',
    ' 09:00',
    540,
    null,
  ]) {
    await expectStatus(businessPath(), 'PUT', 400, owner.accessToken, {
      schedules: [{ ...monday, openingTime: time }],
    });
    await expectStatus(
      employeePath() + '/MONDAY',
      'PATCH',
      400,
      owner.accessToken,
      { endTime: time },
    );
  }
});
test('duplicate days, invalid enums, booleans and internal fields are rejected', async () => {
  for (const [path, row] of [
    [businessPath(), monday],
    [employeePath(), work],
  ] as const) {
    for (const schedules of [
      [row, row],
      [{ ...row, dayOfWeek: 'monday' }],
      [{ ...row, active: 'false' }],
      [{ ...row, businessId }],
      [{ ...row, employeeId }],
      [{ ...row, id: randomUUID() }],
    ]) {
      await expectStatus(path, 'PUT', 400, owner.accessToken, { schedules });
    }
    await expectStatus(path, 'PUT', 400, owner.accessToken, {
      schedules: [],
      ownerId: owner.user.id,
    });
    await expectStatus(path + '/FUNDAY', 'PATCH', 400, owner.accessToken, {
      active: false,
    });
    await expectStatus(path + '/MONDAY', 'PATCH', 400, owner.accessToken, {});
    await expectStatus(path + '/MONDAY', 'PATCH', 400, owner.accessToken, {
      dayOfWeek: 'TUESDAY',
    });
  }
});
test('owner configures employee week including a non-working day', async () => {
  const response = await request(employeePath(), 'PUT', owner.accessToken, {
    schedules: [rest, work],
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [work, rest] });
  assert.deepEqual(await read(employeePath()), { data: [work, rest] });
  const stored = await prisma.employeeSchedule.findUniqueOrThrow({
    where: { employeeId_dayOfWeek: { employeeId, dayOfWeek: 'MONDAY' } },
  });
  assert.equal(stored.startTime, 600);
  assert.equal(stored.endTime, 1020);
});
test('employee cannot work before opening', async () => {
  await expectStatus(employeePath(), 'PUT', 409, owner.accessToken, {
    schedules: [{ ...work, startTime: '08:00' }],
  });
});
test('employee cannot work after closing', async () => {
  await expectStatus(employeePath(), 'PUT', 409, owner.accessToken, {
    schedules: [{ ...work, endTime: '20:00' }],
  });
});
test('employee cannot work on closed or unconfigured business days', async () => {
  for (const dayOfWeek of ['SUNDAY', 'WEDNESDAY'])
    await expectStatus(employeePath(), 'PUT', 409, owner.accessToken, {
      schedules: [{ ...work, dayOfWeek }],
    });
  assert.deepEqual(await read(employeePath()), { data: [work, rest] });
});
test('partial PATCH checks merged intervals and updates just the selected day', async () => {
  await expectStatus(
    employeePath() + '/MONDAY',
    'PATCH',
    200,
    owner.accessToken,
    { startTime: '11:00' },
  );
  assert.deepEqual(await read(employeePath()), {
    data: [{ ...work, startTime: '11:00' }, rest],
  });
  await expectStatus(
    employeePath() + '/MONDAY',
    'PATCH',
    400,
    owner.accessToken,
    { startTime: '18:00' },
  );
  await expectStatus(
    employeePath() + '/MONDAY',
    'PATCH',
    409,
    owner.accessToken,
    { endTime: '19:00' },
  );
  await expectStatus(
    businessPath() + '/TUESDAY',
    'PATCH',
    200,
    owner.accessToken,
    { openingTime: '10:00', closingTime: '16:00' },
  );
  for (const path of [businessPath(), employeePath()])
    await expectStatus(path + '/SATURDAY', 'PATCH', 404, owner.accessToken, {
      active: false,
    });
});
test('business rejects shrinking, closing and removing a day needed by employees', async () => {
  const before = await read(businessPath());
  for (const patch of [
    { openingTime: '12:00' },
    { closingTime: '16:00' },
    { active: false },
  ]) {
    const response = await request(
      businessPath() + '/MONDAY',
      'PATCH',
      owner.accessToken,
      patch,
    );
    assert.equal(response.status, 409);
    assert.equal(
      (await response.json()).error.message,
      'Business schedule conflicts with existing employee schedules',
    );
  }
  await expectStatus(businessPath(), 'PUT', 409, owner.accessToken, {
    schedules: [tuesday, sunday],
  });
  await expectStatus(businessPath(), 'PUT', 409, owner.accessToken, {
    schedules: [],
  });
  assert.deepEqual(await read(businessPath()), before);
});
test('failed weekly employee replacement preserves every existing row', async () => {
  const before = await prisma.employeeSchedule.findMany({
    where: { employeeId },
    orderBy: { dayOfWeek: 'asc' },
  });
  await expectStatus(employeePath(), 'PUT', 409, owner.accessToken, {
    schedules: [work, { ...work, dayOfWeek: 'TUESDAY', endTime: '20:00' }],
  });
  assert.deepEqual(
    await prisma.employeeSchedule.findMany({
      where: { employeeId },
      orderBy: { dayOfWeek: 'asc' },
    }),
    before,
  );
});
test('database failure after deleting a week rolls back the replacement transaction', async () => {
  const before = await prisma.employeeSchedule.findMany({
    where: { employeeId },
    orderBy: { dayOfWeek: 'asc' },
  });
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION test_schedule_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."dayOfWeek" = 'TUESDAY' THEN RAISE EXCEPTION 'Injected test failure'; END IF; RETURN NEW; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER test_schedule_failure BEFORE INSERT ON "EmployeeSchedule" FOR EACH ROW EXECUTE FUNCTION test_schedule_failure()`,
  );
  try {
    await expectStatus(employeePath(), 'PUT', 500, owner.accessToken, {
      schedules: [work, { ...work, dayOfWeek: 'TUESDAY', endTime: '15:00' }],
    });
    assert.deepEqual(
      await prisma.employeeSchedule.findMany({
        where: { employeeId },
        orderBy: { dayOfWeek: 'asc' },
      }),
      before,
    );
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER test_schedule_failure ON "EmployeeSchedule"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION test_schedule_failure()');
  }
});
test('PUT replaces omitted days and can clear employee week atomically', async () => {
  await expectStatus(employeePath(), 'PUT', 200, owner.accessToken, {
    schedules: [work],
  });
  assert.equal(
    await prisma.employeeSchedule.count({ where: { employeeId } }),
    1,
  );
  await expectStatus(employeePath(), 'PUT', 200, owner.accessToken, {
    schedules: [],
  });
  assert.deepEqual(await read(employeePath()), { data: [] });
  await expectStatus(businessPath(), 'PUT', 200, owner.accessToken, {
    schedules: [],
  });
  assert.deepEqual(await read(businessPath()), { data: [] });
  await expectStatus(businessPath(), 'PUT', 200, owner.accessToken, {
    schedules: [monday, tuesday, sunday],
  });
  await expectStatus(employeePath(), 'PUT', 200, owner.accessToken, {
    schedules: [work, rest],
  });
});
test('concurrent business and employee edits cannot commit incompatible schedules', async () => {
  // Both edits fit the initial state, but cannot coexist after either one commits.
  const responses = await Promise.all([
    request(businessPath() + '/MONDAY', 'PATCH', owner.accessToken, {
      openingTime: '10:00',
    }),
    request(employeePath() + '/MONDAY', 'PATCH', owner.accessToken, {
      startTime: '09:00',
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const business = await prisma.businessSchedule.findUniqueOrThrow({
    where: { businessId_dayOfWeek: { businessId, dayOfWeek: 'MONDAY' } },
  });
  const employee = await prisma.employeeSchedule.findUniqueOrThrow({
    where: { employeeId_dayOfWeek: { employeeId, dayOfWeek: 'MONDAY' } },
  });
  assert.ok(business.openingTime <= employee.startTime);
  await expectStatus(
    businessPath() + '/MONDAY',
    'PATCH',
    200,
    owner.accessToken,
    { openingTime: '09:00' },
  );
  await expectStatus(
    employeePath() + '/MONDAY',
    'PATCH',
    200,
    owner.accessToken,
    { startTime: '10:00' },
  );
});
test('concurrent weekly replacements preserve unique days and whole weeks', async () => {
  const weeks = [
    [monday, tuesday, sunday],
    [{ ...monday, openingTime: '08:00' }, sunday],
  ];
  const responses = await Promise.all(
    weeks.map((schedules) =>
      request(businessPath(), 'PUT', owner.accessToken, { schedules }),
    ),
  );
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  );
  const { data } = await read(businessPath());
  assert.ok(
    weeks.some((week) => JSON.stringify(week) === JSON.stringify(data)),
  );
});
test('inactive employees are hidden but their active schedule rows still constrain the business', async () => {
  await expectStatus(
    '/api/employees/' + employeeId,
    'DELETE',
    204,
    owner.accessToken,
  );
  await expectStatus(employeePath(), 'GET', 404);
  await expectStatus(
    businessPath() + '/MONDAY',
    'PATCH',
    409,
    owner.accessToken,
    { active: false },
  );
  // Owner can correct retained schedules even before reactivating the employee.
  await expectStatus(
    employeePath() + '/MONDAY',
    'PATCH',
    200,
    owner.accessToken,
    { active: false },
  );
  await expectStatus(
    businessPath() + '/MONDAY',
    'PATCH',
    200,
    owner.accessToken,
    { active: false },
  );
  await expectStatus(
    employeePath() + '/MONDAY',
    'PATCH',
    409,
    owner.accessToken,
    { active: true },
  );
  await expectStatus(
    '/api/employees/' + employeeId,
    'PATCH',
    200,
    owner.accessToken,
    { active: true },
  );
  assert.equal((await read(employeePath())).data[0].active, false);
});
test('ADMIN has no ownership bypass and missing write targets return 404', async () => {
  await prisma.user.update({
    where: { id: other.user.id },
    data: { role: 'ADMIN' },
  });
  for (const path of [businessPath(), employeePath()])
    await expectStatus(path, 'PUT', 403, other.accessToken, { schedules: [] });
  for (const kind of ['businesses', 'employees'])
    await expectStatus(
      '/api/' + kind + '/' + randomUUID() + '/schedules',
      'PUT',
      404,
      owner.accessToken,
      { schedules: [] },
    );
});
test('database constraints retain unique days and reject invalid active intervals', async () => {
  await assert.rejects(
    prisma.businessSchedule.create({
      data: {
        businessId,
        dayOfWeek: 'MONDAY',
        openingTime: 540,
        closingTime: 1080,
      },
    }),
  );
  await assert.rejects(
    prisma.employeeSchedule.create({
      data: { employeeId, dayOfWeek: 'MONDAY', startTime: 600, endTime: 1020 },
    }),
  );
  await assert.rejects(
    prisma.businessSchedule.create({
      data: {
        businessId,
        dayOfWeek: 'SATURDAY',
        openingTime: 0,
        closingTime: 0,
        active: true,
      },
    }),
  );
  await assert.rejects(
    prisma.employeeSchedule.create({
      data: {
        employeeId,
        dayOfWeek: 'SATURDAY',
        startTime: -1,
        endTime: 0,
        active: false,
      },
    }),
  );
});
test('inactive business hides both schedules and blocks modifications', async () => {
  await expectStatus(
    '/api/businesses/' + businessId,
    'DELETE',
    204,
    owner.accessToken,
  );
  for (const path of [businessPath(), employeePath()]) {
    await expectStatus(path, 'GET', 404);
    await expectStatus(path, 'PUT', 409, owner.accessToken, { schedules: [] });
    await expectStatus(path + '/MONDAY', 'PATCH', 409, owner.accessToken, {
      active: false,
    });
  }
  await expectStatus('/api/health', 'GET', 200);
  await expectStatus('/api/auth/me', 'GET', 200, owner.accessToken);
});
