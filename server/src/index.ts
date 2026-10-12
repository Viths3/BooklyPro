import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';

await prisma.$connect();
const server = app.listen(env.PORT, () => {
  console.info(`BooklyPro API listening on port ${env.PORT}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  server.close(() => {
    void prisma
      .$disconnect()
      .then(() => {
        clearTimeout(timeout);
      })
      .catch(() => process.exit(1));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
