-- Availability and database exclusion share the same blocking statuses.
BEGIN;
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_employee_no_overlap";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_employee_no_overlap" EXCLUDE USING gist (
 "employeeId" WITH =,
 tstzrange("startTime", "endTime", '[)') WITH &&
) WHERE (status IN ('PENDING'::"AppointmentStatus", 'CONFIRMED'::"AppointmentStatus"));
COMMIT;
