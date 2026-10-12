import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { spawnSync } from 'node:child_process';
import { Router } from 'express';
import { createApp } from '../src/app.js';
import { environmentSchema } from '../src/config/environment-schema.js';

const base = { DATABASE_URL: 'postgresql://localhost/test' };
test('startup fails clearly for missing critical variables without exposing values', () => {
  const valid = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '3109',
    DATABASE_URL: 'postgresql://fixture:private-database-value@localhost/test',
    JWT_ACCESS_SECRET: 'access-secret-fixture-that-must-not-be-logged',
    JWT_REFRESH_SECRET: 'refresh-secret-fixture-that-must-not-be-logged',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  };
  for (const field of [
    'PORT',
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ACCESS_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
  ]) {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/server.ts'],
      {
        env: { ...valid, [field]: '' },
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
      },
    );
    assert.equal(result.status, 1, `Invalid ${field} must stop startup`);
    assert.match(result.stderr, new RegExp(field));
    assert.ok(!result.stdout.includes('listening'));
    assert.ok(!result.stderr.includes(valid.DATABASE_URL));
    assert.ok(!result.stderr.includes(valid.JWT_ACCESS_SECRET));
    assert.ok(!result.stderr.includes(valid.JWT_REFRESH_SECRET));
  }
});

test('production requires a valid explicit port and PostgreSQL URL', () => {
  assert.equal(
    environmentSchema.safeParse({ ...base, NODE_ENV: 'production' }).success,
    false,
  );
  for (const PORT of ['', '0', '-1', '3000.5', '65536', 'abc']) {
    assert.equal(environmentSchema.safeParse({ ...base, PORT }).success, false);
  }
  assert.equal(
    environmentSchema.safeParse({
      ...base,
      DATABASE_URL: 'https://example.com',
    }).success,
    false,
  );
  assert.equal(environmentSchema.safeParse({ PORT: 3000 }).success, false);
  assert.equal(
    environmentSchema.parse({ ...base, NODE_ENV: 'production', PORT: '8080' })
      .PORT,
    8080,
  );
  assert.equal(environmentSchema.parse(base).PORT, 3000);
});

test('CORS configuration parses exact origins and has closed production defaults', () => {
  assert.deepEqual(
    environmentSchema.parse({ ...base, NODE_ENV: 'production', PORT: 8080 })
      .CORS_ORIGINS,
    [],
  );
  assert.deepEqual(environmentSchema.parse(base).CORS_ORIGINS, [
    'http://localhost:5173',
  ]);
  assert.deepEqual(
    environmentSchema.parse({ ...base, CORS_ORIGINS: '' }).CORS_ORIGINS,
    [],
  );
  assert.deepEqual(
    environmentSchema.parse({
      ...base,
      CORS_ORIGINS: ' https://one.example,https://two.example ',
    }).CORS_ORIGINS,
    ['https://one.example', 'https://two.example'],
  );
  for (const CORS_ORIGINS of [
    '*',
    'null',
    'https://example.com/path',
    'https://example.com/',
    'https://user:secret@example.com',
    'file:///tmp',
  ]) {
    assert.equal(
      environmentSchema.safeParse({ ...base, CORS_ORIGINS }).success,
      false,
    );
  }
});

test('HTTP security headers, allowed preflight and denied browser origins', async () => {
  const app = createApp(
    async () => {},
    {},
    { corsOrigins: ['https://booklypro.example.com'] },
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/health`;
  try {
    const response = await fetch(url, {
      headers: { Origin: 'https://booklypro.example.com' },
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'https://booklypro.example.com',
    );
    assert.equal(
      response.headers.get('access-control-allow-credentials'),
      null,
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(response.headers.get('strict-transport-security'));
    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://booklypro.example.com',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.match(
      preflight.headers.get('access-control-allow-headers') ?? '',
      /Authorization/,
    );
    for (const origin of [
      'https://evil.example',
      'https://booklypro.example.com.evil.example',
      'null',
    ]) {
      const denied = await fetch(url, { headers: { Origin: origin } });
      assert.equal(denied.headers.get('access-control-allow-origin'), null);
    }
    assert.equal((await fetch(url)).status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('one trusted proxy uses the nearest forwarded client, not a spoofed prefix', async () => {
  const router = Router();
  router.get('/ip', (req, res) => res.json({ ip: req.ip }));
  for (const hops of [0, 1]) {
    const server = createApp(
      async () => {},
      { auth: router },
      { trustProxyHops: hops },
    ).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth/ip`,
        { headers: { 'X-Forwarded-For': '198.51.100.99, 203.0.113.7' } },
      );
      assert.equal(
        (await response.json()).ip,
        hops === 1 ? '203.0.113.7' : '127.0.0.1',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});
