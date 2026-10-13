import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card } from '../../components/common/ui';
import type { Business, Employee, Service } from '../businesses/api';
import { dateLabel, notesSchema, type Notes } from './model';
import type { BookedAppointment } from './api';

const steps = ['Servicio', 'Profesional', 'Fecha', 'Horario', 'Resumen'];
export function BookingStepper({ step }: { step: number }) {
  return (
    <ol className="booking-stepper" aria-label="Pasos de la reserva">
      {steps.map((name, index) => (
        <li
          key={name}
          aria-current={index === step ? 'step' : undefined}
          className={index <= step ? 'reached' : ''}
        >
          <span aria-hidden="true">{index + 1}</span>
          {name}
        </li>
      ))}
    </ol>
  );
}
export function ServiceSelector({
  items,
  selected,
  onSelect,
  currency,
}: {
  items: Service[];
  selected: string;
  onSelect: (id: string) => void;
  currency: string;
}) {
  return (
    <div className="booking-options" aria-label="Servicios">
      {items.map((item) => (
        <button
          type="button"
          className="booking-option"
          key={item.id}
          aria-pressed={selected === item.id}
          onClick={() => onSelect(item.id)}
        >
          <strong>{item.name}</strong>
          {item.description && <span>{item.description}</span>}
          <span className="booking-option-meta">
            {item.durationMinutes} min · {item.price} {currency}
          </span>
        </button>
      ))}
    </div>
  );
}
export function EmployeeSelector({
  items,
  selected,
  onSelect,
}: {
  items: Employee[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="booking-options" aria-label="Profesionales">
      {items.map((item) => (
        <button
          type="button"
          className="booking-option"
          key={item.id}
          aria-pressed={selected === item.id}
          onClick={() => onSelect(item.id)}
        >
          <span className="avatar" aria-hidden="true">
            {item.firstName.slice(0, 1)}
            {item.lastName.slice(0, 1)}
          </span>
          <strong>
            {item.firstName} {item.lastName}
          </strong>
          <span>Profesional disponible para este servicio</span>
        </button>
      ))}
    </div>
  );
}
export function TimeSlotSelector({
  slots,
  selected,
  onSelect,
}: {
  slots: { startTime: string; endTime: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="booking-slots" aria-label="Horarios disponibles">
      {slots.map((slot) => (
        <button
          type="button"
          key={slot.startTime}
          className="booking-slot"
          aria-pressed={selected === slot.startTime}
          onClick={() => onSelect(slot.startTime)}
        >
          {slot.startTime}
        </button>
      ))}
    </div>
  );
}
export function BookingSummary({
  business,
  service,
  employee,
  date,
  slot,
  notes,
  onNotes,
  onConfirm,
  pending,
  authenticated,
}: {
  business: Business;
  service: Service;
  employee: Employee;
  date: string;
  slot: string;
  notes: string;
  onNotes: (value: string) => void;
  onConfirm: (notes: string) => void;
  pending: boolean;
  authenticated: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Notes>({
    resolver: zodResolver(notesSchema),
    defaultValues: { notes },
  });
  return (
    <>
      <dl className="booking-summary">
        <div>
          <dt>Negocio</dt>
          <dd>{business.name}</dd>
        </div>
        <div>
          <dt>Servicio</dt>
          <dd>{service.name}</dd>
        </div>
        <div>
          <dt>Profesional</dt>
          <dd>
            {employee.firstName} {employee.lastName}
          </dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{dateLabel(date)}</dd>
        </div>
        <div>
          <dt>Hora</dt>
          <dd>
            {slot} · {business.timeZone}
          </dd>
        </div>
        <div>
          <dt>Duración</dt>
          <dd>{service.durationMinutes} min</dd>
        </div>
        <div>
          <dt>Precio</dt>
          <dd>
            {service.price} {business.currency}
          </dd>
        </div>
      </dl>
      <form noValidate onSubmit={handleSubmit(({ notes }) => onConfirm(notes))}>
        <div className="field">
          <label htmlFor="booking-notes">Notas (opcional)</label>
          <textarea
            id="booking-notes"
            rows={3}
            maxLength={500}
            disabled={pending}
            {...register('notes', {
              onChange: (event: { target: { value: string } }) =>
                onNotes(event.target.value),
            })}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={errors.notes ? 'notes-error' : 'notes-hint'}
          />
          {errors.notes ? (
            <span id="notes-error" className="field-error">
              {errors.notes.message}
            </span>
          ) : (
            <small id="notes-hint">
              Máximo 500 caracteres. Las notas no se guardan al pasar por login.
            </small>
          )}
        </div>
        <Button type="submit" disabled={pending}>
          {pending
            ? 'Confirmando…'
            : authenticated
              ? 'Confirmar cita'
              : 'Iniciar sesión para confirmar'}
        </Button>
      </form>
    </>
  );
}
export function BookingSuccess({
  appointment,
  currency,
}: {
  appointment: BookedAppointment;
  currency: string;
}) {
  const instant = new Date(appointment.startTime);
  const format = new Intl.DateTimeFormat('es', {
    timeZone: appointment.business.timeZone,
    dateStyle: 'long',
    timeStyle: 'short',
  });
  return (
    <Card className="booking-success">
      <span className="badge">PENDING · Pendiente de confirmación</span>
      <h1>Tu próximo momento está reservado.</h1>
      <p role="status">
        Tu reserva fue creada correctamente y está pendiente de confirmación.
      </p>
      <h2>{appointment.business.name}</h2>
      <p>
        {appointment.service.name} · {appointment.employee.firstName}{' '}
        {appointment.employee.lastName}
      </p>
      <p>
        <time dateTime={appointment.startTime}>{format.format(instant)}</time> ·{' '}
        {appointment.business.timeZone}
      </p>
      <p>
        {appointment.priceAtBooking} {currency}
      </p>
      <Link to="/dashboard/appointments" className="button button-primary">
        Ver mis citas
      </Link>
    </Card>
  );
}
