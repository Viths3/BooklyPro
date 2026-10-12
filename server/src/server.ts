import { AppointmentRepository } from './repositories/appointment.repository.js';
import { AppointmentService } from './services/appointment.service.js';
import { createAppointmentRouter } from './routes/appointment.routes.js';
import { AvailabilityRepository } from './repositories/availability.repository.js';
import { AvailabilityService } from './services/availability.service.js';
import { createAvailabilityRouter } from './routes/availability.routes.js';
import { ScheduleRepository } from './repositories/schedule.repository.js';
import { ScheduleService } from './services/schedule.service.js';
import { createScheduleRouter } from './routes/schedule.routes.js';
import { EmployeeRepository } from './repositories/employee.repository.js';
import { EmployeeService } from './services/employee.service.js';
import { createEmployeeRouter } from './routes/employee.routes.js';
import { ServiceRepository } from './repositories/service.repository.js';
import { ServiceService } from './services/service.service.js';
import { createServiceRouter } from './routes/service.routes.js';
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
const availability = new AvailabilityService(
  new AvailabilityRepository(prisma),
  env.AVAILABILITY_SLOT_INTERVAL_MINUTES,
);
const app = createApp(
  checkDatabase,
  {
    auth: createAuthRouter(auth),
    availability: createAvailabilityRouter(availability),
    appointments: createAppointmentRouter(
      new AppointmentService(new AppointmentRepository(prisma), availability),
      auth,
    ),
    schedules: createScheduleRouter(
      new ScheduleService(new ScheduleRepository(prisma)),
      auth,
    ),
    employees: createEmployeeRouter(
      new EmployeeService(new EmployeeRepository(prisma)),
      auth,
    ),
    services: createServiceRouter(
      new ServiceService(new ServiceRepository(prisma)),
      auth,
    ),
    businesses: createBusinessRouter(businesses, auth),
  },
  { corsOrigins: env.CORS_ORIGINS, trustProxyHops: env.TRUST_PROXY_HOPS },
);

// Fail before accepting HTTP traffic if the database cannot be reached.
try {
  await checkDatabase();
} catch {
  console.error('Database connection failed during startup');
  await prisma.$disconnect();
  process.exit(1);
}
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.info(
    `BooklyPro API listening on 0.0.0.0:${env.PORT} (${env.NODE_ENV})`,
  );
});
server.on('error', () => {
  console.error('HTTP server failed');
  void prisma.$disconnect().finally(() => process.exit(1));
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.info('Shutting down BooklyPro API');
  const timeout = setTimeout(() => {
    console.error('Graceful shutdown timed out');
    server.closeAllConnections();
    void prisma.$disconnect().finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 1000).unref();
  }, 10_000);
  timeout.unref();
  server.close((error) => {
    void prisma
      .$disconnect()
      .then(() => {
        clearTimeout(timeout);
        if (error) process.exitCode = 1;
        console.info('HTTP server and database connections closed');
      })
      .catch(() => {
        console.error('Database shutdown failed');
        process.exit(1);
      });
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
