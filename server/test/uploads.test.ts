import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { AuthService } from '../src/services/auth.service.js';
import { UploadService } from '../src/services/upload.service.js';
import { environmentSchema } from '../src/config/environment-schema.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://localhost/uploads_test';
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = randomBytes(48).toString('hex');
const { createApp } = await import('../src/app.js');
const { createUploadRouter } = await import('../src/routes/upload.routes.js');
const { issueTokens } = await import('../src/utils/jwt.js');
const id = '8e0efdbb-c74a-40dc-8ed8-7a7ba1b83180';
const businessId = '8e0efdbb-c74a-40dc-8ed8-7a7ba1b83181';
const config = {
  CLOUDINARY_CLOUD_NAME: 'fixture',
  CLOUDINARY_API_KEY: '12345',
  CLOUDINARY_API_SECRET: randomBytes(32).toString('hex'),
};
const service = new UploadService(
  {
    findOwnership: async (requested) =>
      requested === businessId ? { ownerId: id } : null,
  },
  config,
);
const auth = {
  getUser: async (userId: string) => ({ id: userId, role: 'CUSTOMER' }),
} as unknown as AuthService;
const app = createApp(async () => {}, {
  uploads: createUploadRouter(service, auth),
});
const server = app.listen(0, '127.0.0.1');
let base: string;
before(async () => {
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);
const input = { context: 'business', contentType: 'image/jpeg', size: 1000 };
function request(body: unknown = input, user: string | null = id) {
  return fetch(base + '/api/uploads/signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(user
        ? {
            Authorization: `Bearer ${issueTokens({ id: user, role: 'CUSTOMER' }).accessToken}`,
          }
        : {}),
    },
    body: JSON.stringify(body),
  });
}
test('upload signature requires existing authentication', async () => {
  assert.equal((await request(input, null)).status, 401);
});
test('signed response contains only approved parameters and no secret', async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const raw = await response.text();
  assert.ok(!raw.includes(config.CLOUDINARY_API_SECRET));
  const { data } = JSON.parse(raw);
  assert.deepEqual(Object.keys(data.params).sort(), [
    'allowed_formats',
    'overwrite',
    'public_id',
    'timestamp',
    'transformation',
  ]);
  assert.equal(data.params.allowed_formats, 'jpg,png,webp');
  assert.equal(data.params.overwrite, 'false');
  assert.ok(data.params.public_id.startsWith(`booklypro/businesses/${id}/`));
  assert.equal(data.expiresAt - Number(data.params.timestamp), 3600);
  const canonical = Object.keys(data.params)
    .sort()
    .map((key) => `${key}=${data.params[key]}`)
    .join('&');
  assert.equal(
    data.signature,
    createHash('sha256')
      .update(canonical + config.CLOUDINARY_API_SECRET)
      .digest('hex'),
  );
});
test('owner may request a signature for an existing business', async () => {
  assert.equal((await request({ ...input, businessId })).status, 200);
});
test('other users cannot sign uploads linked to this business', async () => {
  assert.equal(
    (
      await request(
        { ...input, businessId },
        '8e0efdbb-c74a-40dc-8ed8-7a7ba1b83182',
      )
    ).status,
    403,
  );
});
test('unknown businesses return 404', async () => {
  assert.equal((await request({ ...input, businessId: id })).status, 404);
});
for (const extra of [
  { contentType: 'image/svg+xml' },
  { size: 5242881 },
  { size: 0 },
  { folder: 'arbitrary' },
  { transformation: 'arbitrary' },
  { context: 'employee' },
  { businessId: 'invalid' },
]) {
  test(`rejects malformed upload metadata ${JSON.stringify(extra)}`, async () => {
    assert.equal((await request({ ...input, ...extra })).status, 400);
  });
}
test('uploads disabled without credentials, partial configuration fails validation', async () => {
  await assert.rejects(
    new UploadService({ findOwnership: async () => null }, {}).sign(id, {
      context: 'business',
      contentType: 'image/png',
      size: 1,
    }),
    { code: 'UPLOADS_UNAVAILABLE' },
  );
  assert.equal(
    environmentSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/test',
      CLOUDINARY_CLOUD_NAME: 'fixture',
    }).success,
    false,
  );
  assert.equal(
    environmentSchema.safeParse({
      DATABASE_URL: 'postgresql://localhost/test',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
    }).success,
    true,
  );
});
