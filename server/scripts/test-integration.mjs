import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import { parse } from 'dotenv';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = fileURLToPath(new URL('../', import.meta.url));
const local = parse(readFileSync(new URL('../../.env', import.meta.url)));
const user = local.POSTGRES_USER;
if (!user || !local.POSTGRES_PASSWORD)
  throw new Error('Configure root .env first');
function run(command, args, env, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error('Integration command failed');
}
const suites = readdirSync(new URL('../test/integration/', import.meta.url))
  .filter((name) => name.endsWith('.test.ts'))
  .sort();
for (const suite of suites) {
  const database = `booklypro_test_${randomBytes(8).toString('hex')}`;
  const url = new URL(
    `postgresql://127.0.0.1:${local.POSTGRES_PORT || '5432'}/${database}`,
  );
  url.username = user;
  url.password = local.POSTGRES_PASSWORD;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  };

  // Each suite owns a separate disposable database in the local Compose container.
  run(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'createdb', '-U', user, database],
    env,
  );
  try {
    run(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      env,
      server,
    );
    run(
      process.execPath,
      ['--import', 'tsx', '--test', 'test/integration/' + suite],
      env,
      server,
    );
  } finally {
    run(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'dropdb',
        '--force',
        '-U',
        user,
        database,
      ],
      env,
    );
  }
}
