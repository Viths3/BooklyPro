-- Closed days may use equal times (including 00:00-00:00).
-- Retain the existing 1440 end boundary for previously stored schedules.
BEGIN;
ALTER TABLE "BusinessSchedule" DROP CONSTRAINT "BusinessSchedule_valid";
ALTER TABLE "BusinessSchedule" ADD CONSTRAINT "BusinessSchedule_valid" CHECK (
 "openingTime" >= 0 AND "openingTime" < 1440 AND "closingTime" >= 0 AND "closingTime" <= 1440
 AND (NOT active OR "openingTime" < "closingTime")
);
ALTER TABLE "EmployeeSchedule" DROP CONSTRAINT "EmployeeSchedule_valid";
ALTER TABLE "EmployeeSchedule" ADD CONSTRAINT "EmployeeSchedule_valid" CHECK (
 "startTime" >= 0 AND "startTime" < 1440 AND "endTime" >= 0 AND "endTime" <= 1440
 AND (NOT active OR "startTime" < "endTime")
);
COMMIT;
