import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { prisma, checkDatabase } from '../../src/config/prisma.js';
import { env } from '../../src/config/env.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import type { AppointmentStatus } from '../../src/generated/prisma/enums.js';
import { AuthRepository } from '../../src/repositories/auth.repository.js';
import { AuthService } from '../../src/services/auth.service.js';
import { createAuthRouter } from '../../src/routes/auth.routes.js';
import { BusinessRepository } from '../../src/repositories/business.repository.js';
import { BusinessService } from '../../src/services/business.service.js';
import { createBusinessRouter } from '../../src/routes/business.routes.js';
import { AppointmentRepository } from '../../src/repositories/appointment.repository.js';
import { AppointmentService } from '../../src/services/appointment.service.js';
import { createAppointmentRouter } from '../../src/routes/appointment.routes.js';
import { AvailabilityRepository } from '../../src/repositories/availability.repository.js';
import { AvailabilityService } from '../../src/services/availability.service.js';
import { ReviewRepository } from '../../src/repositories/review.repository.js';
import { ReviewService } from '../../src/services/review.service.js';
import { createReviewRouter } from '../../src/routes/review.routes.js';

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
  appointments: createAppointmentRouter(
    new AppointmentService(
      new AppointmentRepository(prisma),
      new AvailabilityService(new AvailabilityRepository(prisma), 15),
    ),
    auth,
  ),
  reviews: createReviewRouter(
    new ReviewService(new ReviewRepository(prisma)),
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
type Session = z.infer<typeof sessionSchema>;
let base: string;
let owner: Session;
let customer: Session;
let other: Session;
let businessId: string;
let employeeId: string;
let serviceId: string;
let foreignBusinessId: string;
let foreignEmployeeId: string;
let foreignServiceId: string;
const createPath = (id: string) => `/api/appointments/${id}/review`;
const listPath = () => `/api/businesses/${businessId}/reviews`;
function request(path: string, method = 'GET', token?: string, body?: unknown) {
  return fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status, await response.clone().text());
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  assert.ok(
    !JSON.stringify(body).match(
      /P2002|23505|passwordHash|stack|Review_appointmentId|postgresql:\/\//,
    ),
  );
  return body.error;
}
async function account(email: string, firstName: string) {
  const response = await request('/api/auth/register', 'POST', undefined, {
    firstName,
    lastName: 'Private',
    email,
    password: 'Password123!',
  });
  assert.equal(response.status, 201);
  return sessionSchema.parse(
    await (
      await request('/api/auth/login', 'POST', undefined, {
        email,
        password: 'Password123!',
      })
    ).json(),
  );
}
async function appointment(
  status: AppointmentStatus = 'COMPLETED',
  foreign = false,
) {
  return prisma.appointment.create({
    data: {
      customerId: customer.user.id,
      businessId: foreign ? foreignBusinessId : businessId,
      employeeId: foreign ? foreignEmployeeId : employeeId,
      serviceId: foreign ? foreignServiceId : serviceId,
      startTime: new Date('2030-01-07T15:00:00Z'),
      endTime: new Date('2030-01-07T15:30:00Z'),
      priceAtBooking: '8.00',
      status,
    },
  });
}
async function create(rating = 5, comment?: string) {
  const row = await appointment();
  const response = await request(
    createPath(row.id),
    'POST',
    customer.accessToken,
    { rating, ...(comment === undefined ? {} : { comment }) },
  );
  assert.equal(response.status, 201, await response.clone().text());
  return { appointment: row, response, data: (await response.json()).data };
}
before(async () => {
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  owner = await account('review-owner@example.test', 'Owner');
  customer = await account('review-customer@example.test', 'Juan');
  other = await account('review-other@example.test', 'Other');
  businessId = (
    await prisma.business.create({
      data: { ownerId: owner.user.id, name: 'Reviews' },
    })
  ).id;
  employeeId = (
    await prisma.employee.create({
      data: { businessId, firstName: 'Employee', lastName: 'Private' },
    })
  ).id;
  serviceId = (
    await prisma.service.create({
      data: { businessId, name: 'Service', price: '8', durationMinutes: 30 },
    })
  ).id;
  foreignBusinessId = (
    await prisma.business.create({
      data: { ownerId: other.user.id, name: 'Other business' },
    })
  ).id;
  foreignEmployeeId = (
    await prisma.employee.create({
      data: {
        businessId: foreignBusinessId,
        firstName: 'Other',
        lastName: 'Private',
      },
    })
  ).id;
  foreignServiceId = (
    await prisma.service.create({
      data: {
        businessId: foreignBusinessId,
        name: 'Other service',
        price: '9',
        durationMinutes: 30,
      },
    })
  ).id;
});
beforeEach(async () => {
  await prisma.review.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.business.update({
    where: { id: businessId },
    data: { active: true },
  });
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('customer creates review on COMPLETED appointment with a minimal data envelope', async () => {
  const {
    appointment: row,
    response,
    data,
  } = await create(5, '  Excelente atención  ');
  assert.deepEqual(Object.keys(data).sort(), [
    'comment',
    'createdAt',
    'id',
    'rating',
  ]);
  assert.equal(data.comment, 'Excelente atención');
  assert.equal(data.rating, 5);
  assert.ok(z.iso.datetime().safeParse(data.createdAt).success);
  assert.equal(response.headers.get('location'), `/api/reviews/${data.id}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const stored = await prisma.review.findUniqueOrThrow({
    where: { id: data.id },
  });
  assert.equal(stored.customerId, customer.user.id);
  assert.equal(stored.businessId, businessId);
  assert.equal(stored.appointmentId, row.id);
});
for (const rating of [1, 5]) {
  test(`rating ${rating} is valid`, async () => {
    assert.equal((await create(rating)).data.rating, rating);
  });
}
for (const rating of [0, 6, 2.5, '5', null, true]) {
  test(`invalid rating ${JSON.stringify(rating)} is rejected without creating a row`, async () => {
    const row = await appointment();
    const result = await error(
      await request(createPath(row.id), 'POST', customer.accessToken, {
        rating,
      }),
      400,
      'VALIDATION_ERROR',
    );
    assert.ok(
      result.details.some((item: { field: string }) => item.field === 'rating'),
    );
    assert.equal(await prisma.review.count(), 0);
  });
}
test('rating is required', async () => {
  await error(
    await request(
      createPath((await appointment()).id),
      'POST',
      customer.accessToken,
      { comment: 'Hi' },
    ),
    400,
    'VALIDATION_ERROR',
  );
});
test('optional and whitespace-only comments persist as null', async () => {
  for (const comment of [undefined, '', ' \n\t ']) {
    const { data } = await create(4, comment);
    assert.equal(data.comment, null);
    assert.equal(
      (await prisma.review.findUniqueOrThrow({ where: { id: data.id } }))
        .comment,
      null,
    );
  }
});
test('comment accepts 1000 trimmed characters and rejects longer or non-string values', async () => {
  assert.equal(
    (await create(5, ' ' + 'x'.repeat(1000) + ' ')).data.comment.length,
    1000,
  );
  const row = await appointment();
  for (const comment of ['x'.repeat(1001), 42, null, {}]) {
    await error(
      await request(createPath(row.id), 'POST', customer.accessToken, {
        rating: 5,
        comment,
      }),
      400,
      'VALIDATION_ERROR',
    );
  }
});
test('body rejects internal IDs, timestamps and relation injection', async () => {
  const row = await appointment();
  for (const field of [
    'customerId',
    'businessId',
    'appointmentId',
    'id',
    'createdAt',
    'updatedAt',
    'customer',
    'business',
  ]) {
    await error(
      await request(createPath(row.id), 'POST', customer.accessToken, {
        rating: 5,
        [field]: randomUUID(),
      }),
      400,
      'VALIDATION_ERROR',
    );
  }
  assert.equal(await prisma.review.count(), 0);
});
for (const status of [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'NO_SHOW',
] as const) {
  test(`${status} cannot receive a review`, async () => {
    const row = await appointment(status);
    const result = await error(
      await request(createPath(row.id), 'POST', customer.accessToken, {
        rating: 5,
      }),
      409,
      'APPOINTMENT_NOT_REVIEWABLE',
    );
    assert.equal(result.message, 'Only completed appointments can be reviewed');
    assert.equal(await prisma.review.count(), 0);
  });
}
test('missing or invalid authentication cannot create a review', async () => {
  const row = await appointment();
  for (const token of [undefined, 'invalid-token']) {
    await error(
      await request(createPath(row.id), 'POST', token, { rating: 5 }),
      401,
      'UNAUTHORIZED',
    );
  }
});
test('other customer and business owner cannot review another customer appointment', async () => {
  const row = await appointment();
  for (const token of [other.accessToken, owner.accessToken]) {
    await error(
      await request(createPath(row.id), 'POST', token, { rating: 5 }),
      403,
      'FORBIDDEN',
    );
  }
});
test('ADMIN has no ownership bypass', async () => {
  await prisma.user.update({
    where: { id: other.user.id },
    data: { role: 'ADMIN' },
  });
  try {
    await error(
      await request(
        createPath((await appointment()).id),
        'POST',
        other.accessToken,
        { rating: 5 },
      ),
      403,
      'FORBIDDEN',
    );
  } finally {
    await prisma.user.update({
      where: { id: other.user.id },
      data: { role: 'CUSTOMER' },
    });
  }
});
test('unknown appointment returns APPOINTMENT_NOT_FOUND', async () => {
  await error(
    await request(createPath(randomUUID()), 'POST', customer.accessToken, {
      rating: 5,
    }),
    404,
    'APPOINTMENT_NOT_FOUND',
  );
});
test('duplicate review returns conflict and preserves original content', async () => {
  const { appointment: row, data } = await create(5, 'Original');
  const result = await error(
    await request(createPath(row.id), 'POST', customer.accessToken, {
      rating: 1,
    }),
    409,
    'REVIEW_ALREADY_EXISTS',
  );
  assert.equal(result.message, 'This appointment has already been reviewed');
  assert.equal(await prisma.review.count(), 1);
  assert.equal(
    (await prisma.review.findUniqueOrThrow({ where: { id: data.id } })).comment,
    'Original',
  );
});
test('concurrent requests create exactly one review and one clean conflict', async () => {
  const row = await appointment();
  const responses = await Promise.all(
    [1, 5].map((rating) =>
      request(createPath(row.id), 'POST', customer.accessToken, { rating }),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [201, 409],
  );
  await error(
    responses.find((response) => response.status === 409)!,
    409,
    'REVIEW_ALREADY_EXISTS',
  );
  assert.equal(
    await prisma.review.count({ where: { appointmentId: row.id } }),
    1,
  );
});
test('database rejects duplicate direct writes even outside the application', async () => {
  const { appointment: row } = await create();
  await assert.rejects(
    prisma.review.create({
      data: {
        appointmentId: row.id,
        customerId: customer.user.id,
        businessId,
        rating: 4,
      },
    }),
    (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002',
  );
});
test('actual PostgreSQL unique violation maps to REVIEW_ALREADY_EXISTS without leaking internals', async () => {
  const row = await appointment();
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION review_test_conflict() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private SQL detail' USING ERRCODE = '23505', CONSTRAINT = 'Review_appointmentId_key'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER review_test_conflict BEFORE INSERT ON "Review" FOR EACH ROW EXECUTE FUNCTION review_test_conflict()`,
  );
  try {
    const response = await request(
      createPath(row.id),
      'POST',
      customer.accessToken,
      { rating: 5 },
    );
    const result = await error(response, 409, 'REVIEW_ALREADY_EXISTS');
    assert.equal(JSON.stringify(result).includes('private SQL detail'), false);
    assert.equal(await prisma.review.count(), 0);
  } finally {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER review_test_conflict ON "Review"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION review_test_conflict()');
  }
});
test('empty business list has null average, zero totals and default pagination', async () => {
  const response = await request(listPath());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    summary: { averageRating: null, totalReviews: 0 },
  });
});
test('unknown business returns BUSINESS_NOT_FOUND', async () => {
  await error(
    await request(`/api/businesses/${randomUUID()}/reviews`),
    404,
    'BUSINESS_NOT_FOUND',
  );
});
test('public list sorts descending with deterministic ties, paginates and aggregates the whole business', async () => {
  const reviews = [];
  for (const rating of [5, 5, 4]) reviews.push((await create(rating)).data);
  await prisma.review.updateMany({
    data: { createdAt: new Date('2030-01-01T00:00:00Z') },
  });
  await prisma.review.update({
    where: { id: reviews[0].id },
    data: { createdAt: new Date('2029-01-01T00:00:00Z') },
  });
  const expected = [reviews[1].id, reviews[2].id]
    .sort()
    .reverse()
    .concat(reviews[0].id);
  const foreign = await appointment('COMPLETED', true);
  await prisma.review.create({
    data: {
      appointmentId: foreign.id,
      businessId: foreignBusinessId,
      customerId: customer.user.id,
      rating: 1,
    },
  });
  const first = await request(listPath() + '?page=1&limit=2');
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.deepEqual(Object.keys(body).sort(), ['data', 'pagination', 'summary']);
  assert.deepEqual(
    body.data.map((row: { id: string }) => row.id),
    expected.slice(0, 2),
  );
  assert.deepEqual(body.pagination, {
    page: 1,
    limit: 2,
    total: 3,
    totalPages: 2,
  });
  assert.deepEqual(body.summary, { averageRating: 4.7, totalReviews: 3 });
  for (const row of body.data) {
    assert.deepEqual(Object.keys(row).sort(), [
      'comment',
      'createdAt',
      'customer',
      'id',
      'rating',
    ]);
    assert.deepEqual(row.customer, { firstName: 'Juan' });
  }
  const second = await (await request(listPath() + '?page=2&limit=2')).json();
  assert.deepEqual(
    second.data.map((row: { id: string }) => row.id),
    expected.slice(2),
  );
  assert.deepEqual(second.summary, body.summary);
  const past = await (await request(listPath() + '?page=3&limit=2')).json();
  assert.deepEqual(past.data, []);
  assert.equal(past.pagination.total, 3);
  assert.deepEqual(past.summary, body.summary);
});
test('limit 100 is accepted and 101 is rejected', async () => {
  assert.equal((await request(listPath() + '?limit=100')).status, 200);
  await error(
    await request(listPath() + '?limit=101'),
    400,
    'VALIDATION_ERROR',
  );
});
test('invalid pagination, unknown query fields and repeated values are rejected', async () => {
  for (const query of [
    'page=0',
    'limit=0',
    'page=-1',
    'page=1.5',
    'limit=2.5',
    'page=abc',
    'page=1000001',
    'page=1&page=2',
    'limit=1&limit=2',
    'customerId=x',
    'page=',
    'limit=',
  ]) {
    await error(
      await request(listPath() + '?' + query),
      400,
      'VALIDATION_ERROR',
    );
  }
});
test('public individual review exposes only review fields, first name and business identity', async () => {
  const { data } = await create(3, 'Bueno');
  const response = await request(`/api/reviews/${data.id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      ...data,
      customer: { firstName: 'Juan' },
      business: { id: businessId, name: 'Reviews' },
    },
  });
});
test('missing review returns REVIEW_NOT_FOUND and malformed IDs return validation errors', async () => {
  await error(
    await request(`/api/reviews/${randomUUID()}`),
    404,
    'REVIEW_NOT_FOUND',
  );
  for (const path of [
    '/api/reviews/invalid',
    '/api/businesses/invalid/reviews',
  ])
    await error(await request(path), 400, 'VALIDATION_ERROR');
  await error(
    await request(createPath('invalid'), 'POST', customer.accessToken, {
      rating: 5,
    }),
    400,
    'VALIDATION_ERROR',
  );
});
test('completed history remains reviewable and public after business deactivation', async () => {
  await prisma.business.update({
    where: { id: businessId },
    data: { active: false },
  });
  const { data } = await create();
  assert.equal((await request(`/api/reviews/${data.id}`)).status, 200);
  assert.equal(
    (await (await request(listPath())).json()).summary.totalReviews,
    1,
  );
});
test('only one review per appointment, but multiple completed appointments may be reviewed', async () => {
  await create(1);
  await create(5);
  const body = await (await request(listPath())).json();
  assert.deepEqual(body.summary, { averageRating: 3, totalReviews: 2 });
});
test('a completed appointment reached through owner status transitions can be reviewed', async () => {
  const row = await appointment('PENDING');
  for (const status of ['CONFIRMED', 'COMPLETED']) {
    assert.equal(
      (
        await request(
          `/api/appointments/${row.id}/status`,
          'PATCH',
          owner.accessToken,
          { status },
        )
      ).status,
      200,
    );
  }
  assert.equal(
    (
      await request(createPath(row.id), 'POST', customer.accessToken, {
        rating: 5,
      })
    ).status,
    201,
  );
  assert.equal((await request('/api/health')).status, 200);
});
