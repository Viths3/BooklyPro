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
const employeeSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  active: z.boolean(),
});
const dataSchema = z.object({ data: employeeSchema });
const idSchema = z.object({ data: z.object({ id: z.uuid() }) });
let base: string;
let owner: z.infer<typeof sessionSchema>;
let other: z.infer<typeof sessionSchema>;
let businessId: string;
let serviceId: string;
let employeeId: string;
let inactiveId: string;
let secondServiceId: string;
let foreignServiceId: string;
const input = {
  firstName: ' Carlos ',
  lastName: 'Mora',
  email: ' CARLOS@EXAMPLE.COM ',
  phone: '+593999999999',
};
const catalog = () => `/api/businesses/${businessId}/employees`;
function request(path: string, method = 'GET', token?: string, body?: unknown) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function account(email: string) {
  assert.equal(
    (
      await request('/api/auth/register', 'POST', undefined, {
        firstName: 'Service',
        lastName: 'Test',
        email,
        password: 'Password123!',
      })
    ).status,
    201,
  );
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
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  owner = await account('employee-owner@example.test');
  other = await account('employee-other@example.test');
  const response = await request('/api/businesses', 'POST', owner.accessToken, {
    name: 'Service Test Business',
  });
  assert.equal(response.status, 201);
  businessId = z
    .object({ data: z.object({ id: z.uuid() }) })
    .parse(await response.json()).data.id;
  const foreign = await request('/api/businesses', 'POST', other.accessToken, {
    name: 'Other business',
  });
  const foreignId = idSchema.parse(await foreign.json()).data.id;
  async function createService(bid: string, token: string, name: string) {
    const response = await request(
      '/api/businesses/' + bid + '/services',
      'POST',
      token,
      { name, price: '8.10', durationMinutes: 30 },
    );
    assert.equal(response.status, 201);
    return idSchema.parse(await response.json()).data.id;
  }
  serviceId = await createService(businessId, owner.accessToken, 'Corte');
  secondServiceId = await createService(businessId, owner.accessToken, 'Barba');
  foreignServiceId = await createService(foreignId, other.accessToken, 'Other');
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

const detail = () => '/api/employees/' + employeeId;
const assignment = (sid = serviceId, eid = employeeId) =>
  '/api/employees/' + eid + '/services/' + sid;
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
test('owner creates employee with normalized email and active default', async () => {
  const response = await request(catalog(), 'POST', owner.accessToken, input);
  assert.equal(response.status, 201);
  const { data } = dataSchema.parse(await response.json());
  employeeId = data.id;
  assert.equal(data.firstName, 'Carlos');
  assert.equal(data.email, 'carlos@example.com');
  assert.equal(data.active, true);
  assert.equal(response.headers.get('location'), detail());
  assert.equal(
    (await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } }))
      .businessId,
    businessId,
  );
});
test('unauthenticated requests cannot mutate employees or manage private data', async () => {
  await expectStatus(catalog(), 'POST', 401, undefined, input);
  await expectStatus(catalog() + '/manage', 'GET', 401);
  await expectStatus(detail(), 'PATCH', 401, undefined, { firstName: 'X' });
  await expectStatus(detail(), 'DELETE', 401);
  await expectStatus(assignment(), 'POST', 401);
  await expectStatus(assignment(), 'DELETE', 401);
});
test('another owner cannot create employees or see administrative details', async () => {
  await expectStatus(catalog(), 'POST', 403, other.accessToken, input);
  await expectStatus(catalog() + '/manage', 'GET', 403, other.accessToken);
});
test('strict validation rejects missing names, malformed contact and internal fields', async () => {
  const before = await prisma.employee.count();
  for (const body of [
    {},
    { firstName: 'Only' },
    { ...input, firstName: ' ' },
    { ...input, lastName: 'x'.repeat(101) },
    { ...input, email: 'invalid' },
    { ...input, phone: 'abc' },
    { ...input, phone: '1' },
    ...[
      'id',
      'businessId',
      'ownerId',
      'createdAt',
      'updatedAt',
      'services',
      'active',
    ].map((field) => ({ ...input, [field]: 'injected' })),
  ]) {
    await expectStatus(catalog(), 'POST', 400, owner.accessToken, body);
  }
  assert.equal(await prisma.employee.count(), before);
});
test('owner partially updates employee and can clear contact fields', async () => {
  const response = await request(detail(), 'PATCH', owner.accessToken, {
    lastName: 'Nuevo',
    email: null,
    phone: null,
  });
  assert.equal(response.status, 200);
  const { data } = dataSchema.parse(await response.json());
  assert.equal(data.firstName, 'Carlos');
  assert.equal(data.lastName, 'Nuevo');
  assert.equal(data.email, null);
  for (const body of [
    {},
    { active: 'false' },
    { businessId },
    { id: employeeId },
    { createdAt: '2030-01-01' },
    { updatedAt: '2030-01-01' },
    { email: 'invalid' },
    { services: [] },
  ]) {
    await expectStatus(detail(), 'PATCH', 400, owner.accessToken, body);
  }
});
test('another owner cannot update or deactivate employee even as ADMIN', async () => {
  await expectStatus(detail(), 'PATCH', 403, other.accessToken, {
    active: false,
  });
  await prisma.user.update({
    where: { id: other.user.id },
    data: { role: 'ADMIN' },
  });
  await expectStatus(detail(), 'PATCH', 403, other.accessToken, {
    active: false,
  });
  await expectStatus(detail(), 'DELETE', 403, other.accessToken);
});
test('public list and detail keep contact and administrative fields private', async () => {
  const response = await request(catalog());
  assert.deepEqual(await response.json(), {
    data: [{ id: employeeId, firstName: 'Carlos', lastName: 'Nuevo' }],
  });
  const raw = await (await request(detail())).json();
  assert.deepEqual(Object.keys(raw.data).sort(), [
    'firstName',
    'id',
    'lastName',
    'services',
  ]);
  assert.deepEqual(raw.data.services, []);
});
test('owner assigns an active service with exact serialized price', async () => {
  await expectStatus(assignment(), 'POST', 204, owner.accessToken);
  const raw = await (await request(detail() + '/services')).json();
  assert.equal(raw.data.length, 1);
  assert.equal(raw.data[0].id, serviceId);
  assert.equal(raw.data[0].price, '8.10');
  assert.equal(
    await prisma.employeeService.count({
      where: { employeeId, serviceId, businessId },
    }),
    1,
  );
});
test('duplicate assignment returns conflict without duplicate rows including concurrent requests', async () => {
  await expectStatus(assignment(), 'POST', 409, owner.accessToken);
  const responses = await Promise.all([
    request(assignment(secondServiceId), 'POST', owner.accessToken),
    request(assignment(secondServiceId), 'POST', owner.accessToken),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [204, 409]);
  assert.equal(
    await prisma.employeeService.count({ where: { employeeId } }),
    2,
  );
});
test('services from another business cannot be assigned or unassigned', async () => {
  await expectStatus(
    assignment(foreignServiceId),
    'POST',
    400,
    owner.accessToken,
  );
  await expectStatus(
    assignment(foreignServiceId),
    'DELETE',
    400,
    owner.accessToken,
  );
  assert.equal(
    await prisma.employeeService.count({
      where: { employeeId, serviceId: foreignServiceId },
    }),
    0,
  );
});
test('another user cannot assign or remove services', async () => {
  await expectStatus(assignment(), 'POST', 403, other.accessToken);
  await expectStatus(assignment(), 'DELETE', 403, other.accessToken);
});
test('soft deactivation is idempotent and preserves assigned services', async () => {
  await expectStatus(detail(), 'DELETE', 204, owner.accessToken);
  await expectStatus(detail(), 'DELETE', 204, owner.accessToken);
  assert.equal(
    (await prisma.employee.findUniqueOrThrow({ where: { id: employeeId } }))
      .active,
    false,
  );
  assert.equal(
    await prisma.employeeService.count({ where: { employeeId } }),
    2,
  );
});
test('inactive employee disappears from every public endpoint', async () => {
  assert.deepEqual(await (await request(catalog())).json(), { data: [] });
  await expectStatus(detail(), 'GET', 404);
  await expectStatus(detail() + '/services', 'GET', 404);
});
test('inactive employee cannot receive assignments', async () => {
  await expectStatus(assignment(), 'POST', 409, owner.accessToken);
});
test('managed list includes active and inactive employees and all assignments', async () => {
  const response = await request(catalog(), 'POST', owner.accessToken, {
    firstName: 'Ana',
    lastName: 'Alba',
  });
  inactiveId = dataSchema.parse(await response.json()).data.id;
  const raw = await (
    await request(catalog() + '/manage', 'GET', owner.accessToken)
  ).json();
  assert.equal(raw.data.length, 2);
  assert.equal(raw.data[0].firstName, 'Ana');
  assert.equal(raw.data[1].active, false);
  assert.equal(raw.data[1].services.length, 2);
  assert.ok(
    'email' in raw.data[1] &&
      'phone' in raw.data[1] &&
      'createdAt' in raw.data[1],
  );
  const pub = await (await request(catalog())).json();
  assert.deepEqual(
    pub.data.map((e: { id: string }) => e.id),
    [inactiveId],
  );
});
test('owner reactivates employee and existing assignments become available again', async () => {
  await expectStatus(detail(), 'PATCH', 200, owner.accessToken, {
    active: true,
  });
  assert.equal(
    (await (await request(detail() + '/services')).json()).data.length,
    2,
  );
});
test('inactive services stay assigned but are hidden publicly', async () => {
  await expectStatus(
    '/api/services/' + secondServiceId,
    'DELETE',
    204,
    owner.accessToken,
  );
  const raw = await (await request(detail() + '/services')).json();
  assert.deepEqual(
    raw.data.map((s: { id: string }) => s.id),
    [serviceId],
  );
  assert.equal(
    (await (await request(detail())).json()).data.services.length,
    1,
  );
  assert.equal(
    await prisma.employeeService.count({ where: { employeeId } }),
    2,
  );
  const managed = await (
    await request(catalog() + '/manage', 'GET', owner.accessToken)
  ).json();
  assert.equal(
    managed.data.find((e: { id: string }) => e.id === employeeId).services
      .length,
    2,
  );
});
test('inactive service cannot be assigned to another employee', async () => {
  await expectStatus(
    assignment(secondServiceId, inactiveId),
    'POST',
    409,
    owner.accessToken,
  );
  assert.equal(
    await prisma.employeeService.count({ where: { employeeId: inactiveId } }),
    0,
  );
});
test('owner removes only the assignment, including inactive services, idempotently', async () => {
  await expectStatus(
    assignment(secondServiceId),
    'DELETE',
    204,
    owner.accessToken,
  );
  await expectStatus(
    assignment(secondServiceId),
    'DELETE',
    204,
    owner.accessToken,
  );
  assert.equal(
    await prisma.employeeService.count({
      where: { employeeId, serviceId: secondServiceId },
    }),
    0,
  );
  assert.ok(
    await prisma.service.findUnique({ where: { id: secondServiceId } }),
  );
  assert.ok(await prisma.employee.findUnique({ where: { id: employeeId } }));
});
test('UUID validation and missing entities return 400 or 404 consistently', async () => {
  for (const path of [
    '/api/employees/invalid',
    '/api/employees/invalid/services',
    '/api/businesses/invalid/employees',
  ])
    await expectStatus(path, 'GET', 400);
  await expectStatus(assignment('invalid'), 'POST', 400, owner.accessToken);
  await expectStatus(assignment(randomUUID()), 'POST', 404, owner.accessToken);
  await expectStatus('/api/employees/' + randomUUID(), 'GET', 404);
  await expectStatus(
    '/api/employees/' + randomUUID(),
    'PATCH',
    404,
    owner.accessToken,
    { active: true },
  );
  await expectStatus(
    '/api/businesses/' + randomUUID() + '/employees',
    'GET',
    404,
  );
  await expectStatus(
    '/api/businesses/' + randomUUID() + '/employees',
    'POST',
    404,
    owner.accessToken,
    input,
  );
});
test('inactive business hides employees and blocks create, update, reactivate and assignment', async () => {
  await expectStatus(
    '/api/businesses/' + businessId,
    'DELETE',
    204,
    owner.accessToken,
  );
  await expectStatus(catalog(), 'GET', 404);
  await expectStatus(detail(), 'GET', 404);
  await expectStatus(detail() + '/services', 'GET', 404);
  await expectStatus(catalog(), 'POST', 409, owner.accessToken, input);
  await expectStatus(detail(), 'PATCH', 409, owner.accessToken, {
    active: true,
  });
  await expectStatus(
    assignment(serviceId, inactiveId),
    'POST',
    409,
    owner.accessToken,
  );
  await expectStatus(catalog() + '/manage', 'GET', 200, owner.accessToken);
  await expectStatus(detail(), 'DELETE', 204, owner.accessToken);
  assert.equal(
    await prisma.employeeService.count({ where: { employeeId } }),
    1,
  );
  await expectStatus(assignment(), 'DELETE', 204, owner.accessToken);
  await expectStatus('/api/health', 'GET', 200);
  await expectStatus('/api/auth/me', 'GET', 200, owner.accessToken);
});
