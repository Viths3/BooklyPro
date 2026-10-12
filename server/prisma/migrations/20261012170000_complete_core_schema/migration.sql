-- Incremental migration: preserve existing schedules and historical reviews.
BEGIN;
ALTER TYPE "Role" ADD VALUE 'ADMIN';
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');
ALTER TABLE "Business" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- The old convention was Sunday=0 through Saturday=6.
ALTER TABLE "BusinessSchedule" DROP CONSTRAINT "BusinessSchedule_valid";
ALTER TABLE "EmployeeSchedule" DROP CONSTRAINT "EmployeeSchedule_valid";
ALTER TABLE "BusinessSchedule" ALTER COLUMN "dayOfWeek" TYPE "DayOfWeek" USING
  (CASE "dayOfWeek" WHEN 0 THEN 'SUNDAY' WHEN 1 THEN 'MONDAY' WHEN 2 THEN 'TUESDAY' WHEN 3 THEN 'WEDNESDAY' WHEN 4 THEN 'THURSDAY' WHEN 5 THEN 'FRIDAY' WHEN 6 THEN 'SATURDAY' END)::"DayOfWeek";
ALTER TABLE "EmployeeSchedule" ALTER COLUMN "dayOfWeek" TYPE "DayOfWeek" USING
  (CASE "dayOfWeek" WHEN 0 THEN 'SUNDAY' WHEN 1 THEN 'MONDAY' WHEN 2 THEN 'TUESDAY' WHEN 3 THEN 'WEDNESDAY' WHEN 4 THEN 'THURSDAY' WHEN 5 THEN 'FRIDAY' WHEN 6 THEN 'SATURDAY' END)::"DayOfWeek";
ALTER TABLE "EmployeeSchedule" RENAME COLUMN "openingTime" TO "startTime";
ALTER TABLE "EmployeeSchedule" RENAME COLUMN "closingTime" TO "endTime";
ALTER TABLE "BusinessSchedule"
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EmployeeSchedule"
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BusinessSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "EmployeeSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Review" ADD COLUMN "updatedAt" TIMESTAMPTZ(3);
UPDATE "Review" SET "updatedAt" = "createdAt";
ALTER TABLE "Review" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "BusinessSchedule" ADD CONSTRAINT "BusinessSchedule_valid" CHECK ("openingTime" >= 0 AND "closingTime" <= 1440 AND "openingTime" < "closingTime");
ALTER TABLE "EmployeeSchedule" ADD CONSTRAINT "EmployeeSchedule_valid" CHECK ("startTime" >= 0 AND "endTime" <= 1440 AND "startTime" < "endTime");
CREATE INDEX "Appointment_employeeId_startTime_idx" ON "Appointment"("employeeId", "startTime");
CREATE INDEX "Appointment_status_startTime_idx" ON "Appointment"("status", "startTime");
CREATE INDEX "Appointment_startTime_idx" ON "Appointment"("startTime");
CREATE INDEX "Business_active_name_idx" ON "Business"("active", "name");
COMMIT;
