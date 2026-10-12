import { BusinessRepository } from './repositories/business.repository.js';
import { BusinessService } from './services/business.service.js';
import { createBusinessRouter } from './routes/business.routes.js';
import { AuthRepository } from './repositories/auth.repository.js';
import { AuthService } from './services/auth.service.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma, checkDatabase } from './config/prisma.js';

const auth = new AuthService(new AuthRepository(prisma));
const businesses = new BusinessService(new BusinessRepository(prisma));
const app = createApp(checkDatabase, {
  auth: createAuthRouter(auth),
  businesses: createBusinessRouter(businesses, auth),
});
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
