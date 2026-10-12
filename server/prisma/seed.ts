import { randomBytes, scryptSync } from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { DayOfWeek, Role } from '../src/generated/prisma/enums.js';
import { env } from '../src/config/env.js';

// Unknown random credentials: no reusable development password and no login yet.
function seedPasswordHash(): string {
  const salt = randomBytes(16);
  const hash = scryptSync(randomBytes(32), salt, 64);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function seed() {
  if (env.NODE_ENV !== 'development') {
    throw new Error('Seed is only allowed with NODE_ENV=development');
  }
  await prisma.$transaction(async (tx) => {
    const owner = await tx.user.upsert({
      where: { email: 'owner@booklypro.example' },
      update: {},
      create: {
        firstName: 'Ana',
        lastName: 'Demo',
        email: 'owner@booklypro.example',
        role: Role.BUSINESS_OWNER,
        passwordHash: seedPasswordHash(),
      },
    });
    if (owner.role !== Role.BUSINESS_OWNER)
      throw new Error('Seed owner email belongs to a different role');
    await tx.user.upsert({
      where: { email: 'customer@booklypro.example' },
      update: {},
      create: {
        firstName: 'Luis',
        lastName: 'Demo',
        email: 'customer@booklypro.example',
        role: Role.CUSTOMER,
        passwordHash: seedPasswordHash(),
      },
    });
    const business = await tx.business.upsert({
      where: { id: '10000000-0000-4000-8000-000000000001' },
      update: {},
      create: {
        id: '10000000-0000-4000-8000-000000000001',
        ownerId: owner.id,
        name: 'BooklyPro Barbería Demo',
        description: 'Negocio ficticio de desarrollo',
        address: 'Dirección de ejemplo',
        timeZone: 'America/Guayaquil',
        currency: 'USD',
      },
    });
    if (business.ownerId !== owner.id)
      throw new Error('Seed business belongs to a different owner');
    const employee = await tx.employee.upsert({
      where: { id: '10000000-0000-4000-8000-000000000002' },
      update: {},
      create: {
        id: '10000000-0000-4000-8000-000000000002',
        businessId: business.id,
        firstName: 'Carlos',
        lastName: 'Demo',
      },
    });
    for (const serviceData of [
      {
        id: '10000000-0000-4000-8000-000000000003',
        name: 'Corte de cabello',
        price: '15.00',
        durationMinutes: 30,
      },
      {
        id: '10000000-0000-4000-8000-000000000004',
        name: 'Arreglo de barba',
        price: '8.00',
        durationMinutes: 20,
      },
    ]) {
      const service = await tx.service.upsert({
        where: { id: serviceData.id },
        update: {},
        create: { ...serviceData, businessId: business.id },
      });
      await tx.employeeService.upsert({
        where: {
          employeeId_serviceId: {
            employeeId: employee.id,
            serviceId: service.id,
          },
        },
        update: {},
        create: {
          employeeId: employee.id,
          serviceId: service.id,
          businessId: business.id,
        },
      });
    }
    for (const dayOfWeek of [
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
    ]) {
      await tx.businessSchedule.upsert({
        where: { businessId_dayOfWeek: { businessId: business.id, dayOfWeek } },
        update: {},
        create: {
          businessId: business.id,
          dayOfWeek,
          openingTime: 540,
          closingTime: 1080,
        },
      });
      await tx.employeeSchedule.upsert({
        where: { employeeId_dayOfWeek: { employeeId: employee.id, dayOfWeek } },
        update: {},
        create: {
          employeeId: employee.id,
          dayOfWeek,
          startTime: 540,
          endTime: 1020,
        },
      });
    }
  });
  console.info(
    'Development seed ready: 2 users, 1 business, 2 services, 1 employee and weekday schedules.',
  );
}

seed()
  .catch(() => {
    console.error(
      'Seed failed. Check development environment, migrations and existing fixture data.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
