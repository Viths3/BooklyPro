-- Run with psql -v ON_ERROR_STOP=1. All fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.expect_failure(command text, expected_state text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected SQLSTATE % for: %', expected_state, command;
END;
$$ LANGUAGE plpgsql;

INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'fixture@example.test', 'test-only-hash', 'Test', 'User', now());
INSERT INTO "Business" (id, "ownerId", name, "updatedAt") VALUES
('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Fixture', now()),
('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Other', now());
INSERT INTO "Employee" (id, "businessId", "firstName", "lastName", "updatedAt") VALUES
('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Test', 'Employee', now());
INSERT INTO "Service" (id, "businessId", name, price, "durationMinutes", "updatedAt") VALUES
('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'Service', 25, 30, now()),
('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003', 'Other', 25, 30, now());
INSERT INTO "Appointment" (id, "customerId", "businessId", "employeeId", "serviceId", "startTime", "endTime", "priceAtBooking", "updatedAt") VALUES
('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005', '2030-01-01 10:00Z', '2030-01-01 10:30Z', 25, now());
SELECT pg_temp.expect_failure($q$INSERT INTO "Appointment" SELECT '00000000-0000-4000-8000-000000000008', "customerId", "businessId", "employeeId", "serviceId", '2030-01-01 10:15Z', '2030-01-01 10:45Z', "priceAtBooking", status, notes, "createdAt", "updatedAt" FROM "Appointment" WHERE id = '00000000-0000-4000-8000-000000000007'$q$, '23P01');
-- Adjacent slots succeed.
INSERT INTO "Appointment" SELECT '00000000-0000-4000-8000-000000000008', "customerId", "businessId", "employeeId", "serviceId", '2030-01-01 10:30Z', '2030-01-01 11:00Z', "priceAtBooking", status, notes, "createdAt", "updatedAt" FROM "Appointment" WHERE id = '00000000-0000-4000-8000-000000000007';
-- Cancellation frees the interval.
UPDATE "Appointment" SET status = 'CANCELLED' WHERE id = '00000000-0000-4000-8000-000000000007';
INSERT INTO "Appointment" SELECT '00000000-0000-4000-8000-000000000009', "customerId", "businessId", "employeeId", "serviceId", "startTime", "endTime", "priceAtBooking", 'CONFIRMED', notes, "createdAt", "updatedAt" FROM "Appointment" WHERE id = '00000000-0000-4000-8000-000000000007';
SELECT pg_temp.expect_failure($q$UPDATE "Appointment" SET status = 'CONFIRMED' WHERE id = '00000000-0000-4000-8000-000000000007'$q$, '23P01');
SELECT pg_temp.expect_failure($q$UPDATE "Appointment" SET "serviceId" = '00000000-0000-4000-8000-000000000006' WHERE id = '00000000-0000-4000-8000-000000000007'$q$, '23503');
SELECT pg_temp.expect_failure($q$UPDATE "Appointment" SET "endTime" = "startTime" WHERE id = '00000000-0000-4000-8000-000000000007'$q$, '23514');
SELECT pg_temp.expect_failure($q$UPDATE "Service" SET price = -1$q$, '23514');
SELECT pg_temp.expect_failure($q$UPDATE "Service" SET "durationMinutes" = 0$q$, '23514');
SELECT pg_temp.expect_failure($q$INSERT INTO "BusinessSchedule" (id, "businessId", "dayOfWeek", "openingTime", "closingTime", "updatedAt") VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'MONDAY', 1080, 540, now())$q$, '23514');
SELECT pg_temp.expect_failure($q$INSERT INTO "EmployeeSchedule" (id, "employeeId", "dayOfWeek", "startTime", "endTime", "updatedAt") VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000004', 'MONDAY', 1080, 540, now())$q$, '23514');
SELECT pg_temp.expect_failure($q$INSERT INTO "EmployeeService" VALUES ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002')$q$, '23503');
SELECT pg_temp.expect_failure($q$INSERT INTO "Review" (id, "customerId", "businessId", "appointmentId", rating, "updatedAt") VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000007', 6, now())$q$, '23514');
SELECT pg_temp.expect_failure($q$INSERT INTO "Review" (id, "customerId", "businessId", "appointmentId", rating, "updatedAt") VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000007', 5, now())$q$, '23503');
SELECT pg_temp.expect_failure($q$UPDATE "User" SET email = 'UPPER@example.test'$q$, '23514');
INSERT INTO "BusinessSchedule" (id, "businessId", "dayOfWeek", "openingTime", "closingTime", "updatedAt") VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'MONDAY', 540, 1080, now());
SELECT pg_temp.expect_failure($q$INSERT INTO "BusinessSchedule" (id, "businessId", "dayOfWeek", "openingTime", "closingTime", "updatedAt") VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000002', 'MONDAY', 540, 1080, now())$q$, '23505');
SELECT pg_temp.expect_failure($q$UPDATE "BusinessSchedule" SET "dayOfWeek" = 'INVALID'$q$, '22P02');
UPDATE "User" SET role = 'ADMIN' WHERE id = '00000000-0000-4000-8000-000000000001';
ROLLBACK;
