-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'BUSINESS_OWNER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "phone" VARCHAR(30),
    "address" TEXT,
    "imageUrl" TEXT,
    "timeZone" VARCHAR(100) NOT NULL DEFAULT 'America/Guayaquil',
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeService" (
    "employeeId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "businessId" UUID NOT NULL,

    CONSTRAINT "EmployeeService_pkey" PRIMARY KEY ("employeeId","serviceId")
);

-- CreateTable
CREATE TABLE "BusinessSchedule" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openingTime" INTEGER NOT NULL,
    "closingTime" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BusinessSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSchedule" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openingTime" INTEGER NOT NULL,
    "closingTime" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EmployeeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "priceAtBooking" DECIMAL(12,2) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Business_ownerId_idx" ON "Business"("ownerId");

-- CreateIndex
CREATE INDEX "Employee_businessId_active_idx" ON "Employee"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_id_businessId_key" ON "Employee"("id", "businessId");

-- CreateIndex
CREATE INDEX "Service_businessId_active_idx" ON "Service"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Service_id_businessId_key" ON "Service"("id", "businessId");

-- CreateIndex
CREATE INDEX "EmployeeService_serviceId_businessId_idx" ON "EmployeeService"("serviceId", "businessId");

-- CreateIndex
CREATE INDEX "EmployeeService_employeeId_businessId_idx" ON "EmployeeService"("employeeId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSchedule_businessId_dayOfWeek_key" ON "BusinessSchedule"("businessId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSchedule_employeeId_dayOfWeek_key" ON "EmployeeSchedule"("employeeId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Appointment_customerId_startTime_idx" ON "Appointment"("customerId", "startTime");

-- CreateIndex
CREATE INDEX "Appointment_businessId_startTime_idx" ON "Appointment"("businessId", "startTime");

-- CreateIndex
CREATE INDEX "Appointment_employeeId_businessId_idx" ON "Appointment"("employeeId", "businessId");

-- CreateIndex
CREATE INDEX "Appointment_serviceId_businessId_idx" ON "Appointment"("serviceId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_id_customerId_businessId_key" ON "Appointment"("id", "customerId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_appointmentId_key" ON "Review"("appointmentId");

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- CreateIndex
CREATE INDEX "Review_businessId_createdAt_idx" ON "Review"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_appointmentId_customerId_businessId_key" ON "Review"("appointmentId", "customerId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeService" ADD CONSTRAINT "EmployeeService_employeeId_businessId_fkey" FOREIGN KEY ("employeeId", "businessId") REFERENCES "Employee"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeService" ADD CONSTRAINT "EmployeeService_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "Service"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSchedule" ADD CONSTRAINT "BusinessSchedule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSchedule" ADD CONSTRAINT "EmployeeSchedule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_employeeId_businessId_fkey" FOREIGN KEY ("employeeId", "businessId") REFERENCES "Employee"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "Service"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_appointmentId_customerId_businessId_fkey" FOREIGN KEY ("appointmentId", "customerId", "businessId") REFERENCES "Appointment"("id", "customerId", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom invariants not expressible in the Prisma schema.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK (email = lower(btrim(email)) AND length(email) > 0);
ALTER TABLE "Business" ADD CONSTRAINT "Business_currency_format" CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE "Service" ADD CONSTRAINT "Service_price_nonnegative" CHECK (price >= 0),
  ADD CONSTRAINT "Service_duration_valid" CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 1440);
ALTER TABLE "BusinessSchedule" ADD CONSTRAINT "BusinessSchedule_valid" CHECK (
  "dayOfWeek" BETWEEN 0 AND 6 AND "openingTime" >= 0 AND "closingTime" <= 1440 AND "openingTime" < "closingTime"
);
ALTER TABLE "EmployeeSchedule" ADD CONSTRAINT "EmployeeSchedule_valid" CHECK (
  "dayOfWeek" BETWEEN 0 AND 6 AND "openingTime" >= 0 AND "closingTime" <= 1440 AND "openingTime" < "closingTime"
);
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_time_valid" CHECK ("endTime" > "startTime"),
  ADD CONSTRAINT "Appointment_price_nonnegative" CHECK ("priceAtBooking" >= 0),
  ADD CONSTRAINT "Appointment_employee_no_overlap" EXCLUDE USING gist (
    "employeeId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  ) WHERE (status <> 'CANCELLED'::"AppointmentStatus");
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_valid" CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_expiration_valid" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "RefreshToken_revocation_valid" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt"),
  ADD CONSTRAINT "RefreshToken_hash_valid" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
