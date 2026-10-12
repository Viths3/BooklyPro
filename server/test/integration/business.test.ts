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
const repository = new BusinessRepository(prisma);
const businesses = new BusinessService(repository);
const app = createApp(checkDatabase, {
  auth: createAuthRouter(auth),
  businesses: createBusinessRouter(businesses, auth),
});
const server = app.listen(0, '127.0.0.1');
let base: string;
const sessionSchema = z.object({
  accessToken: z.string(),
  user: z.object({ id: z.uuid() }),
});
const businessSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  description: z.string().nullable(),
});
const dataSchema = z.object({ data: businessSchema });
const listSchema = z.object({
  data: z.array(businessSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});
let owner: z.infer<typeof sessionSchema>;
let other: z.infer<typeof sessionSchema>;
let admin: z.infer<typeof sessionSchema>;
let firstId: string;
let secondId: string;

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
  const registration = await request('/api/auth/register', 'POST', undefined, {
    firstName: 'Business',
    lastName: 'Test',
    email,
    password: 'Password123!',
  });
  assert.equal(registration.status, 201);
  const login = await request('/api/auth/login', 'POST', undefined, {
    email,
    password: 'Password123!',
  });
  assert.equal(login.status, 200);
  return sessionSchema.parse(await login.json());
}
before(async () => {
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  owner = await account('business-owner@example.test');
  other = await account('other-customer@example.test');
  admin = await account('business-admin@example.test');
  await prisma.user.update({
    where: { id: admin.user.id },
    data: { role: 'ADMIN' },
  });
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('creation and own-business listing require authentication', async () => {
  assert.equal(
    (await request('/api/businesses', 'POST', undefined, { name: 'Denied' }))
      .status,
    401,
  );
  assert.equal((await request('/api/businesses/me')).status, 401);
  const empty = listSchema.parse(
    await (await request('/api/businesses')).json(),
  );
  assert.equal(empty.pagination.totalPages, 0);
});
test('creation ignores no ownership fields: forbidden input is rejected', async () => {
  for (const extra of [
    { ownerId: other.user.id },
    { role: 'ADMIN' },
    { active: false },
    { id: randomUUID() },
  ]) {
    assert.equal(
      (
        await request('/api/businesses', 'POST', owner.accessToken, {
          name: 'Denied',
          ...extra,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } }))
      .role,
    'CUSTOMER',
  );
  assert.equal(await prisma.business.count(), 0);
});
test('customer creates a business and is promoted atomically', async () => {
  const response = await request('/api/businesses', 'POST', owner.accessToken, {
    name: ' Alpha Barber ',
    description: 'Professional barber',
    imageUrl: 'https://example.test/image.jpg',
  });
  assert.equal(response.status, 201);
  const raw = await response.json();
  const { data } = dataSchema.parse(raw);
  firstId = data.id;
  assert.equal(data.name, 'Alpha Barber');
  assert.equal(data.active, true);
  assert.equal(response.headers.get('location'), `/api/businesses/${firstId}`);
  assert.ok(!JSON.stringify(raw).includes('ownerId'));
  assert.ok(!JSON.stringify(raw).includes('passwordHash'));
  const saved = await prisma.business.findUniqueOrThrow({
    where: { id: firstId },
  });
  assert.equal(saved.ownerId, owner.user.id);
  const me = await (
    await request('/api/auth/me', 'GET', owner.accessToken)
  ).json();
  assert.equal(me.role, 'BUSINESS_OWNER'); // Same access token uses current DB role.
});
test('an owner can create a second business', async () => {
  const response = await request('/api/businesses', 'POST', owner.accessToken, {
    name: 'Beta Salon',
  });
  assert.equal(response.status, 201);
  secondId = dataSchema.parse(await response.json()).data.id;
  assert.equal(
    await prisma.business.count({ where: { ownerId: owner.user.id } }),
    2,
  );
});
test('public listing supports stable ordering, pagination and case-insensitive search', async () => {
  const first = listSchema.parse(
    await (
      await request('/api/businesses?page=1&limit=1&sortBy=name&order=asc')
    ).json(),
  );
  assert.equal(first.data[0]?.id, firstId);
  assert.deepEqual(first.pagination, {
    page: 1,
    limit: 1,
    total: 2,
    totalPages: 2,
  });
  const second = listSchema.parse(
    await (
      await request('/api/businesses?page=2&limit=1&sortBy=name&order=asc')
    ).json(),
  );
  assert.equal(second.data[0]?.id, secondId);
  const match = listSchema.parse(
    await (await request('/api/businesses?search=BARBER')).json(),
  );
  assert.equal(match.pagination.total, 1);
  assert.equal(match.data[0]?.id, firstId);
  const pastEnd = listSchema.parse(
    await (await request('/api/businesses?page=99')).json(),
  );
  assert.deepEqual(pastEnd.data, []);
});
test('public detail exposes business data without owner information', async () => {
  const response = await request(`/api/businesses/${firstId}`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.id, firstId);
  for (const field of [
    'owner',
    'ownerId',
    'email',
    'passwordHash',
    'refreshTokens',
  ])
    assert.ok(!(field in body.data));
  assert.equal((await request(`/api/businesses/${randomUUID()}`)).status, 404);
});
test('invalid UUID, pagination, sort and optional fields are rejected', async () => {
  assert.equal((await request('/api/businesses/invalid')).status, 400);
  for (const query of [
    'page=0',
    'page=10001',
    'page=1.5',
    'page=1&page=2',
    'limit=101',
    'limit=-1',
    'limit=',
    'sortBy=ownerId',
    'order=random',
    `search=${'a'.repeat(151)}`,
  ]) {
    assert.equal((await request(`/api/businesses?${query}`)).status, 400);
  }
  for (const body of [
    { name: ' ' },
    { name: 'Ok', imageUrl: 'javascript:alert(1)' },
    { name: 'Ok', imageUrl: 'https://user:pass@example.test' },
    { name: 'Ok', phone: 'letters' },
  ]) {
    assert.equal(
      (await request('/api/businesses', 'POST', owner.accessToken, body))
        .status,
      400,
    );
  }
});
test('only owner can patch, and protected fields cannot be changed', async () => {
  assert.equal(
    (
      await request(`/api/businesses/${firstId}`, 'PATCH', other.accessToken, {
        name: 'Stolen',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/api/businesses/${firstId}`, 'PATCH', undefined, {
        name: 'Stolen',
      })
    ).status,
    401,
  );
  for (const body of [
    {},
    { ownerId: other.user.id },
    { active: true },
    { role: 'ADMIN' },
    { createdAt: '2030-01-01' },
  ]) {
    assert.equal(
      (
        await request(
          `/api/businesses/${firstId}`,
          'PATCH',
          owner.accessToken,
          body,
        )
      ).status,
      400,
    );
  }
  const response = await request(
    `/api/businesses/${firstId}`,
    'PATCH',
    owner.accessToken,
    { description: null, address: 'Cuenca', phone: '+593999999999' },
  );
  assert.equal(response.status, 200);
  const { data } = dataSchema.parse(await response.json());
  assert.equal(data.name, 'Alpha Barber');
  assert.equal(data.description, null);
  assert.equal(
    (await prisma.business.findUniqueOrThrow({ where: { id: firstId } }))
      .ownerId,
    owner.user.id,
  );
});
test('deactivation is owner-only, idempotent and preserves the row', async () => {
  assert.equal(
    (await request(`/api/businesses/${firstId}`, 'DELETE', other.accessToken))
      .status,
    403,
  );
  assert.equal(
    (await request(`/api/businesses/${firstId}`, 'DELETE')).status,
    401,
  );
  assert.equal(
    (await request(`/api/businesses/${firstId}`, 'DELETE', owner.accessToken))
      .status,
    204,
  );
  assert.equal(
    (await request(`/api/businesses/${firstId}`, 'DELETE', owner.accessToken))
      .status,
    204,
  );
  assert.equal(
    (await prisma.business.findUniqueOrThrow({ where: { id: firstId } }))
      .active,
    false,
  );
  assert.equal((await request(`/api/businesses/${firstId}`)).status, 404);
  const list = listSchema.parse(
    await (await request('/api/businesses')).json(),
  );
  assert.deepEqual(
    list.data.map((business) => business.id),
    [secondId],
  );
});
test('me resolves before :id and returns only the owners businesses including inactive', async () => {
  const response = await request(
    '/api/businesses/me',
    'GET',
    owner.accessToken,
  );
  assert.equal(response.status, 200);
  const body = z
    .object({ data: z.array(businessSchema) })
    .parse(await response.json());
  assert.equal(body.data.length, 2);
  assert.equal(
    body.data.find((business) => business.id === firstId)?.active,
    false,
  );
  const others = await request(
    `/api/businesses/me?ownerId=${owner.user.id}`,
    'GET',
    other.accessToken,
  );
  assert.deepEqual(await others.json(), { data: [] });
  assert.equal(
    (
      await request(`/api/businesses/${firstId}`, 'PATCH', owner.accessToken, {
        name: 'Archived Barber',
      })
    ).status,
    200,
  );
  assert.equal((await request(`/api/businesses/${firstId}`)).status, 404);
});
test('search treats wildcard and SQL-like text literally', async () => {
  assert.equal(
    (
      await request('/api/businesses', 'POST', owner.accessToken, {
        name: '100%_Local',
      })
    ).status,
    201,
  );
  for (const value of ['%', '_']) {
    const results = listSchema.parse(
      await (
        await request(`/api/businesses?search=${encodeURIComponent(value)}`)
      ).json(),
    );
    assert.equal(results.pagination.total, 1);
    assert.equal(results.data[0]?.name, '100%_Local');
  }
  const injection = listSchema.parse(
    await (
      await request(
        `/api/businesses?search=${encodeURIComponent("' OR 1=1 --")}`,
      )
    ).json(),
  );
  assert.equal(injection.pagination.total, 0);
});
test('a database creation failure rolls back the customer role promotion', async () => {
  await assert.rejects(
    repository.create(other.user.id, { name: 'x'.repeat(151) }),
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } }))
      .role,
    'CUSTOMER',
  );
  assert.equal(
    await prisma.business.count({ where: { ownerId: other.user.id } }),
    0,
  );
});
test('concurrent first businesses promote once without losing either business', async () => {
  const responses = await Promise.all(
    ['Concurrent A', 'Concurrent B'].map((name) =>
      request('/api/businesses', 'POST', other.accessToken, { name }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status),
    [201, 201],
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } }))
      .role,
    'BUSINESS_OWNER',
  );
  assert.equal(
    await prisma.business.count({ where: { ownerId: other.user.id } }),
    2,
  );
});
test('admin keeps its role and receives no override of business ownership', async () => {
  assert.equal(
    (
      await request(`/api/businesses/${secondId}`, 'PATCH', admin.accessToken, {
        name: 'Admin override',
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/api/businesses/${secondId}`, 'DELETE', admin.accessToken))
      .status,
    403,
  );
  assert.equal(
    (
      await request('/api/businesses', 'POST', admin.accessToken, {
        name: 'Admin owned',
      })
    ).status,
    201,
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: admin.user.id } }))
      .role,
    'ADMIN',
  );
});
test('health and authentication continue working after business operations', async () => {
  assert.equal((await request('/api/health')).status, 200);
  const me = await request('/api/auth/me', 'GET', owner.accessToken);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).role, 'BUSINESS_OWNER');
});
