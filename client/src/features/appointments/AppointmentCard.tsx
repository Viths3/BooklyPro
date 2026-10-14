import { Link } from 'react-router-dom';
import { Card } from '../../components/common/ui';
import { appointmentDate, type Status, type Appointment } from './api';
import { StatusBadge } from '../../components/common/StatusBadge';
export function AppointmentStatusBadge({ status }: { status: Status }) {
  return <StatusBadge status={status} />;
}
export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const { business, service, employee, startTime } = appointment;
  return (
    <Card className="appointment-card">
      <AppointmentStatusBadge status={appointment.status} />
      <h3>{business.name}</h3>
      <p>
        {service.name} · {employee.firstName} {employee.lastName}
      </p>
      <p>
        <time dateTime={startTime}>
          {appointmentDate(startTime, business.timeZone, 'date')} ·{' '}
          {appointmentDate(startTime, business.timeZone, 'time')}
        </time>
      </p>
      <small>{business.timeZone}</small>
      {appointment.priceAtBooking !== undefined && (
        <p className="appointment-price">
          Importe reservado: <strong>{appointment.priceAtBooking}</strong>
        </p>
      )}
      <Link
        className="text-link"
        to={`/dashboard/appointments/${appointment.id}`}
      >
        Ver detalles →
      </Link>
    </Card>
  );
}
