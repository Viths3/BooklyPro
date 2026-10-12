import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import express from 'express';

const server = app.listen(0, '127.0.0.1');
let baseUrl: string;
before(async () => {
  if (!server.listening)
    await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);

test('health returns the public API contract', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    service: 'booklypro-api',
  });
  assert.equal(response.headers.get('x-powered-by'), null);
});
test('unknown routes return JSON 404', async () => {
  const response = await fetch(`${baseUrl}/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { message: 'Route not found' },
  });
});
test('invalid JSON returns 400', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(response.status, 400);
});
test('oversized body returns 413', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(110_000) }),
  });
  assert.equal(response.status, 413);
});
test('unexpected errors do not expose internal details', async () => {
  const failingApp = express();
  failingApp.get('/', async () => {
    throw new Error('secret database details');
  });
  failingApp.use(errorHandler);
  const failingServer = failingApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) =>
    failingServer.once('listening', resolve),
  );
  try {
    const response = await fetch(
      `http://127.0.0.1:${(failingServer.address() as AddressInfo).port}`,
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { message: 'Internal server error' },
    });
  } finally {
    await new Promise<void>((resolve) => failingServer.close(() => resolve()));
  }
});
