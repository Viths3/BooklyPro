// Read-only smoke test against an explicitly configured database. No seed or writes.
import 'dotenv/config';
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const { fetch, AbortSignal } = globalThis;

assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
  JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGINS: 'https://booklypro.example.com',
  TRUST_PROXY_HOPS: '1',
};
const child = spawn(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `
  await import('./dist/server.js');
  process.on('SIGTERM', () => { if (process.connected) process.disconnect(); });
  process.on('message', () => {
    process.emit('SIGTERM');
  });
`,
  ],
  { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true },
);
let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});
const exited = once(child, 'exit');
const timeout = setTimeout(() => child.kill('SIGKILL'), 25000);
try {
  const url = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.status === 200) {
        assert.deepEqual(await response.json(), {
          data: {
            status: 'ok',
            service: 'booklypro-api',
            database: 'connected',
          },
        });
        healthy = true;
        break;
      }
    } catch {
      /* Wait for startup without logging connection details. */
    }
    await delay(100);
  }
  assert.ok(healthy, 'Compiled production server must become healthy');
  const protectedResponse = await fetch(`${url}/api/auth/me`);
  assert.equal(protectedResponse.status, 401);
  assert.equal((await protectedResponse.json()).error.code, 'UNAUTHORIZED');
  const response = await fetch(`${url}/api/health`, {
    headers: { Origin: 'https://booklypro.example.com' },
  });
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://booklypro.example.com',
  );
  // Windows does not deliver POSIX signals: exercise the registered handler via IPC.
  if (process.platform === 'win32') child.send('stop');
  else child.kill('SIGTERM');
  const [code] = await exited;
  assert.equal(code, 0, 'Graceful shutdown must exit successfully');
  assert.match(output, /HTTP server and database connections closed/);
  assert.ok(!output.includes(env.JWT_ACCESS_SECRET));
  assert.ok(!output.includes(env.JWT_REFRESH_SECRET));
  assert.ok(!output.includes(env.DATABASE_URL));
  console.info(
    'Production smoke passed: health 200, auth 401, CORS, clean shutdown, no secrets in logs',
  );
} finally {
  clearTimeout(timeout);
  if (child.exitCode === null) child.kill('SIGKILL');
}
