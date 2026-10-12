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
const serviceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.string(),
  durationMinutes: z.number(),
  active: z.boolean(),
});
const dataSchema = z.object({ data: serviceSchema });
const listSchema = z.object({ data: z.array(serviceSchema) });
let base: string;
let owner: z.infer<typeof sessionSchema>;
let other: z.infer<typeof sessionSchema>;
let businessId: string;
let serviceId: string;
let pricedId: string;
const input = {
  name: 'Corte de cabello',
  description: 'Corte clasico',
  price: 8,
  durationMinutes: 30,
};
const catalog = () => `/api/businesses/${businessId}/services`;
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
  owner = await account('service-owner@example.test');
  other = await account('service-other@example.test');
  const response = await request('/api/businesses', 'POST', owner.accessToken, {
    name: 'Service Test Business',
  });
  assert.equal(response.status, 201);
  businessId = z
    .object({ data: z.object({ id: z.uuid() }) })
    .parse(await response.json()).data.id;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('public list distinguishes empty catalog, missing business and invalid UUID', async () => {
  const response = await request(catalog());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [] });
  assert.equal(
    (await request(`/api/businesses/${randomUUID()}/services`)).status,
    404,
  );
  assert.equal((await request('/api/businesses/invalid/services')).status, 400);
  assert.equal((await request('/api/services/invalid')).status, 400);
});
test('only an authenticated owner can create or manage services', async () => {
  assert.equal(
    (await request(catalog(), 'POST', undefined, input)).status,
    401,
  );
  assert.equal(
    (await request(catalog(), 'POST', other.accessToken, input)).status,
    403,
  );
  assert.equal((await request(`${catalog()}/manage`)).status, 401);
  assert.equal(
    (await request(`${catalog()}/manage`, 'GET', other.accessToken)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/businesses/${randomUUID()}/services`,
        'POST',
        owner.accessToken,
        input,
      )
    ).status,
    404,
  );
});
test('create stores Decimal and returns fixed two-decimal text with safe fields', async () => {
  const response = await request(catalog(), 'POST', owner.accessToken, input);
  assert.equal(response.status, 201);
  const raw = await response.json();
  const { data } = dataSchema.parse(raw);
  serviceId = data.id;
  assert.equal(data.price, '8.00');
  assert.equal(data.durationMinutes, 30);
  assert.equal(data.active, true);
  assert.equal(response.headers.get('location'), `/api/services/${serviceId}`);
  assert.deepEqual(Object.keys(raw.data).sort(), [
    'active',
    'description',
    'durationMinutes',
    'id',
    'name',
    'price',
  ]);
  const stored = await prisma.service.findUniqueOrThrow({
    where: { id: serviceId },
  });
  assert.equal(stored.businessId, businessId);
  assert.equal(stored.price.toFixed(2), '8.00');
});
test('decimal text preserves precision, upper bound and free services are supported', async () => {
  const response = await request(catalog(), 'POST', owner.accessToken, {
    ...input,
    name: 'A exact price',
    price: '9999999999.99',
  });
  assert.equal(response.status, 201);
  const { data } = dataSchema.parse(await response.json());
  pricedId = data.id;
  assert.equal(data.price, '9999999999.99');
  assert.equal(
    (
      await prisma.service.findUniqueOrThrow({ where: { id: pricedId } })
    ).price.toFixed(2),
    '9999999999.99',
  );
  const free = await request(catalog(), 'POST', owner.accessToken, {
    ...input,
    name: 'Free',
    price: 0,
  });
  assert.equal(dataSchema.parse(await free.json()).data.price, '0.00');
});
test('price and duration reject invalid values without creating rows', async () => {
  const before = await prisma.service.count();
  for (const price of [
    -1,
    '1.001',
    0.1 + 0.2,
    '10000000000.00',
    '1e2',
    null,
    true,
    '',
  ]) {
    assert.equal(
      (await request(catalog(), 'POST', owner.accessToken, { ...input, price }))
        .status,
      400,
    );
  }
  for (const durationMinutes of [0, -15, 30.5, 1441, '30', null]) {
    assert.equal(
      (
        await request(catalog(), 'POST', owner.accessToken, {
          ...input,
          durationMinutes,
        })
      ).status,
      400,
    );
  }
  for (const body of [{ name: 'Incomplete' }, { ...input, name: ' ' }]) {
    assert.equal(
      (await request(catalog(), 'POST', owner.accessToken, body)).status,
      400,
    );
  }
  assert.equal(await prisma.service.count(), before);
});
test('create rejects internal fields including business and initial active state', async () => {
  for (const extra of [
    { businessId: randomUUID() },
    { ownerId: other.user.id },
    { id: randomUUID() },
    { active: false },
    { createdAt: '2030-01-01' },
    { updatedAt: '2030-01-01' },
    { employees: [] },
  ]) {
    assert.equal(
      (
        await request(catalog(), 'POST', owner.accessToken, {
          ...input,
          ...extra,
        })
      ).status,
      400,
    );
  }
});
test('public list is ordered by name and detail serializes Decimal consistently', async () => {
  const response = await request(catalog());
  const { data } = listSchema.parse(await response.json());
  assert.deepEqual(
    data.map((service) => service.name),
    ['A exact price', 'Corte de cabello', 'Free'],
  );
  assert.ok(
    data.every(
      (service) => service.active && /^\d+\.\d{2}$/.test(service.price),
    ),
  );
  const detail = await request(`/api/services/${serviceId}`);
  assert.equal(detail.status, 200);
  assert.equal(dataSchema.parse(await detail.json()).data.price, '8.00');
  assert.equal((await request(`/api/services/${randomUUID()}`)).status, 404);
});
test('patch is partial and restricted to the owner and allowed fields', async () => {
  assert.equal(
    (
      await request(`/api/services/${serviceId}`, 'PATCH', undefined, {
        price: '8.10',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(`/api/services/${serviceId}`, 'PATCH', other.accessToken, {
        price: '8.10',
      })
    ).status,
    403,
  );
  for (const body of [
    {},
    { businessId: randomUUID() },
    { id: randomUUID() },
    { createdAt: '2030-01-01' },
    { updatedAt: '2030-01-01' },
    { active: 'false' },
    { price: '2.999' },
    { durationMinutes: 0 },
  ]) {
    assert.equal(
      (
        await request(
          `/api/services/${serviceId}`,
          'PATCH',
          owner.accessToken,
          body,
        )
      ).status,
      400,
    );
  }
  const response = await request(
    `/api/services/${serviceId}`,
    'PATCH',
    owner.accessToken,
    { price: '8.10', description: null, durationMinutes: 45 },
  );
  assert.equal(response.status, 200);
  const { data } = dataSchema.parse(await response.json());
  assert.equal(data.price, '8.10');
  assert.equal(data.description, null);
  assert.equal(data.name, input.name);
  assert.equal(data.durationMinutes, 45);
});
test('delete is idempotent soft deactivation; manage includes hidden services', async () => {
  assert.equal(
    (await request(`/api/services/${serviceId}`, 'DELETE')).status,
    401,
  );
  assert.equal(
    (await request(`/api/services/${serviceId}`, 'DELETE', other.accessToken))
      .status,
    403,
  );
  assert.equal(
    (await request(`/api/services/${serviceId}`, 'DELETE', owner.accessToken))
      .status,
    204,
  );
  assert.equal(
    (await request(`/api/services/${serviceId}`, 'DELETE', owner.accessToken))
      .status,
    204,
  );
  assert.equal(
    (await prisma.service.findUniqueOrThrow({ where: { id: serviceId } }))
      .active,
    false,
  );
  assert.equal((await request(`/api/services/${serviceId}`)).status, 404);
  const publicData = listSchema.parse(
    await (await request(catalog())).json(),
  ).data;
  assert.ok(!publicData.some((service) => service.id === serviceId));
  const managed = listSchema.parse(
    await (
      await request(`${catalog()}/manage`, 'GET', owner.accessToken)
    ).json(),
  ).data;
  assert.equal(
    managed.find((service) => service.id === serviceId)?.active,
    false,
  );
});
test('patch can reactivate services and explicitly deactivate them', async () => {
  assert.equal(
    (
      await request(`/api/services/${serviceId}`, 'PATCH', owner.accessToken, {
        active: true,
      })
    ).status,
    200,
  );
  assert.equal((await request(`/api/services/${serviceId}`)).status, 200);
  assert.equal(
    (
      await request(`/api/services/${serviceId}`, 'PATCH', owner.accessToken, {
        active: false,
      })
    ).status,
    200,
  );
  assert.equal((await request(`/api/services/${serviceId}`)).status, 404);
});
test('admin has no ownership bypass', async () => {
  await prisma.user.update({
    where: { id: other.user.id },
    data: { role: 'ADMIN' },
  });
  assert.equal(
    (await request(catalog(), 'POST', other.accessToken, input)).status,
    403,
  );
  assert.equal(
    (
      await request(`/api/services/${pricedId}`, 'PATCH', other.accessToken, {
        active: false,
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(`/api/services/${pricedId}`, 'DELETE', other.accessToken))
      .status,
    403,
  );
});
test('inactive business hides its entire catalog and blocks create, edit and reactivation', async () => {
  assert.equal(
    (
      await request(
        `/api/businesses/${businessId}`,
        'DELETE',
        owner.accessToken,
      )
    ).status,
    204,
  );
  assert.equal((await request(catalog())).status, 404);
  assert.equal((await request(`/api/services/${pricedId}`)).status, 404);
  assert.equal(
    (await request(catalog(), 'POST', owner.accessToken, input)).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/services/${pricedId}`, 'PATCH', owner.accessToken, {
        name: 'Blocked',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/services/${serviceId}`, 'PATCH', owner.accessToken, {
        active: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`${catalog()}/manage`, 'GET', owner.accessToken)).status,
    200,
  );
  assert.equal(
    (await request(`${catalog()}/manage`, 'GET', other.accessToken)).status,
    403,
  );
  assert.equal(
    (await request(`/api/services/${pricedId}`, 'DELETE', owner.accessToken))
      .status,
    204,
  );
  assert.equal(
    (await prisma.service.findUniqueOrThrow({ where: { id: pricedId } }))
      .active,
    false,
  );
});
test('unknown service cannot be changed and health remains connected', async () => {
  assert.equal(
    (
      await request(
        `/api/services/${randomUUID()}`,
        'PATCH',
        owner.accessToken,
        { name: 'Missing' },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/services/${randomUUID()}`,
        'DELETE',
        owner.accessToken,
      )
    ).status,
    404,
  );
  assert.equal((await request('/api/health')).status, 200);
});
