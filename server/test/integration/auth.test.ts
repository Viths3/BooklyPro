import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { prisma, checkDatabase } from '../../src/config/prisma.js';
import { env } from '../../src/config/env.js';
import { authConfig } from '../../src/config/auth.js';
import { AuthService } from '../../src/services/auth.service.js';
import { AuthRepository } from '../../src/repositories/auth.repository.js';
import { createAuthRouter } from '../../src/routes/auth.routes.js';
import { authenticate } from '../../src/middleware/authenticate.js';
import { authorizeRoles } from '../../src/middleware/authorize-roles.js';
import { hashToken } from '../../src/utils/jwt.js';
import { comparePassword } from '../../src/utils/password.js';

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
const router = createAuthRouter(auth);
router.get(
  '/test-admin',
  authenticate(auth),
  authorizeRoles('ADMIN'),
  (_req, res) => res.json({ allowed: true }),
);
router.get('/test-no-auth', authorizeRoles('ADMIN'), (_req, res) => res.end());
const app = createApp(checkDatabase, router);
const server = app.listen(0, '127.0.0.1');
let baseUrl: string;
const password = 'Password123!';
const email = 'customer@example.test';
const sessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: z.object({ id: z.uuid(), role: z.string() }),
});
let session: z.infer<typeof sessionSchema>;

before(async () => {
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});
function post(path: string, body: unknown) {
  return fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function get(path: string, token?: string) {
  return fetch(`${baseUrl}/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
async function login() {
  const response = await post('login', { email, password });
  assert.equal(response.status, 200);
  return sessionSchema.parse(await response.json());
}

test('register normalizes email, hashes password and returns only safe fields', async () => {
  const response = await post('register', {
    firstName: ' Juan ',
    lastName: ' Demo ',
    email: ' CUSTOMER@EXAMPLE.TEST ',
    password,
  });
  assert.equal(response.status, 201);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), [
    'email',
    'firstName',
    'id',
    'lastName',
    'role',
  ]);
  assert.equal(body.email, email);
  assert.equal(body.role, 'CUSTOMER');
  assert.equal(body.firstName, 'Juan');
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.notEqual(user.passwordHash, password);
  assert.ok(await comparePassword(password, user.passwordHash));
});
test('duplicate normalized email returns 409', async () => {
  assert.equal(
    (
      await post('register', {
        firstName: 'Other',
        lastName: 'User',
        email: email.toUpperCase(),
        password,
      })
    ).status,
    409,
  );
});
test('role injection and passwords above 72 UTF-8 bytes are rejected', async () => {
  assert.equal(
    (
      await post('register', {
        firstName: 'Other',
        lastName: 'User',
        email: 'other@example.test',
        password,
        role: 'ADMIN',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post('register', {
        firstName: 'Other',
        lastName: 'User',
        email: 'other@example.test',
        password: 'é'.repeat(37),
      })
    ).status,
    400,
  );
  assert.equal(await prisma.user.count(), 1);
});
test('unknown email and wrong password return identical generic errors', async () => {
  const missing = await post('login', {
    email: 'missing@example.test',
    password,
  });
  const wrong = await post('login', { email, password: 'incorrect-password' });
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(await missing.json(), await wrong.json());
});
test('login persists only a refresh hash with expiry and family', async () => {
  session = await login();
  const stored = await prisma.refreshToken.findUniqueOrThrow({
    where: { tokenHash: hashToken(session.refreshToken) },
  });
  assert.equal(stored.userId, session.user.id);
  assert.notEqual(stored.tokenHash, session.refreshToken);
  assert.equal(stored.tokenHash.length, 64);
  assert.equal(stored.revokedAt, null);
  const claims = jwt.decode(session.accessToken) as jwt.JwtPayload;
  assert.equal((claims.exp ?? 0) - (claims.iat ?? 0), 900);
  const refreshClaims = jwt.decode(session.refreshToken) as jwt.JwtPayload;
  assert.equal((refreshClaims.exp ?? 0) - (refreshClaims.iat ?? 0), 604800);
  assert.equal(stored.expiresAt.getTime(), (refreshClaims.exp ?? 0) * 1000);
  assert.ok(!JSON.stringify(session).includes('passwordHash'));
});
test('me requires a valid access token and exposes safe fields', async () => {
  assert.equal((await get('me')).status, 401);
  assert.equal((await get('me', 'invalid')).status, 401);
  assert.equal((await get('me', session.refreshToken)).status, 401);
  const response = await get('me', session.accessToken);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const user = await response.json();
  assert.deepEqual(Object.keys(user).sort(), [
    'email',
    'firstName',
    'id',
    'lastName',
    'role',
  ]);
});
test('roles are read from PostgreSQL, not stale JWT claims', async () => {
  assert.equal((await get('test-no-auth')).status, 401);
  assert.equal((await get('test-admin', session.accessToken)).status, 403);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { role: 'ADMIN' },
  });
  assert.equal((await get('test-admin', session.accessToken)).status, 200);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { role: 'CUSTOMER' },
  });
  assert.equal((await get('test-admin', session.accessToken)).status, 403);
});
test('refresh rotates the token and replay revokes its replacement', async () => {
  const response = await post('refresh', {
    refreshToken: session.refreshToken,
  });
  assert.equal(response.status, 200);
  const rotated = sessionSchema.parse(await response.json());
  assert.notEqual(rotated.refreshToken, session.refreshToken);
  assert.equal((await get('me', rotated.accessToken)).status, 200);
  const old = await prisma.refreshToken.findUniqueOrThrow({
    where: { tokenHash: hashToken(session.refreshToken) },
  });
  assert.ok(old.revokedAt);
  assert.equal(
    (await post('refresh', { refreshToken: session.refreshToken })).status,
    401,
  );
  assert.equal(
    (await post('refresh', { refreshToken: rotated.refreshToken })).status,
    401,
  );
});
test('invalid, expired, wrong-type and wrong-algorithm tokens are rejected', async () => {
  assert.equal((await post('refresh', {})).status, 400);
  assert.equal(
    (await post('refresh', { refreshToken: 'invalid' })).status,
    401,
  );
  assert.equal(
    (await post('refresh', { refreshToken: session.accessToken })).status,
    401,
  );
  const expired = jwt.sign({ type: 'refresh' }, authConfig.JWT_REFRESH_SECRET, {
    subject: session.user.id,
    jwtid: randomUUID(),
    issuer: 'booklypro-api',
    audience: 'booklypro-refresh',
    expiresIn: -1,
  });
  assert.equal((await post('refresh', { refreshToken: expired })).status, 401);
  const wrongAlgorithm = jwt.sign(
    { type: 'access', role: 'CUSTOMER' },
    authConfig.JWT_ACCESS_SECRET,
    {
      algorithm: 'HS384',
      subject: session.user.id,
      issuer: 'booklypro-api',
      audience: 'booklypro-access',
      expiresIn: 900,
    },
  );
  assert.equal((await get('me', wrongAlgorithm)).status, 401);
  const expiredAccess = jwt.sign(
    { type: 'access', role: 'CUSTOMER' },
    authConfig.JWT_ACCESS_SECRET,
    {
      subject: session.user.id,
      issuer: 'booklypro-api',
      audience: 'booklypro-access',
      expiresIn: -1,
    },
  );
  assert.equal((await get('me', expiredAccess)).status, 401);
});
test('logout is idempotent, revokes persisted family and isolates other logins', async () => {
  const first = await login();
  const other = await login();
  assert.equal(
    (await post('logout', { refreshToken: first.refreshToken })).status,
    204,
  );
  assert.equal(
    (await post('logout', { refreshToken: first.refreshToken })).status,
    204,
  );
  assert.equal(
    (await post('refresh', { refreshToken: first.refreshToken })).status,
    401,
  );
  assert.equal(
    (await post('refresh', { refreshToken: other.refreshToken })).status,
    200,
  );
  assert.equal((await get('me', first.accessToken)).status, 200); // Stateless access expires naturally.
});
test('concurrent refresh permits one rotation and replay invalidates the family', async () => {
  const concurrent = await login();
  const responses = await Promise.all([
    post('refresh', { refreshToken: concurrent.refreshToken }),
    post('refresh', { refreshToken: concurrent.refreshToken }),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 401],
  );
  const success = responses.find((response) => response.status === 200);
  assert.ok(success);
  const rotated = sessionSchema.parse(await success.json());
  assert.equal(
    (await post('refresh', { refreshToken: rotated.refreshToken })).status,
    401,
  );
});
test('database expiration is enforced even with a valid JWT', async () => {
  const current = await login();
  await prisma.$executeRaw`UPDATE "RefreshToken" SET "createdAt" = now() - interval '2 days', "expiresAt" = now() - interval '1 day' WHERE "tokenHash" = ${hashToken(current.refreshToken)}`;
  assert.equal(
    (await post('refresh', { refreshToken: current.refreshToken })).status,
    401,
  );
});
test('health remains connected with authentication enabled', async () => {
  const response = await fetch(baseUrl.replace('/auth', '/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    service: 'booklypro-api',
    database: 'connected',
  });
});
test('repeated authentication attempts are rate limited', async () => {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 21; attempt++) {
    response = await post('login', {});
    if (response.status === 429) break;
  }
  assert.equal(response?.status, 429);
});
