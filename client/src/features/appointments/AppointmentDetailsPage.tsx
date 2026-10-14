import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError } from '../../api/client';
import {
  Button,
  EmptyState,
  ErrorMessage,
  Loading,
} from '../../components/common/ui';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useAuth } from '../auth/AuthProvider';
import { queryKeys } from '../../lib/query';
import {
  appointmentDate,
  appointmentsApi,
  type AppointmentDetail,
  type ReviewInput,
} from './api';
import { AppointmentStatusBadge } from './AppointmentCard';
import { ReviewForm } from './ReviewForm';
export function AppointmentDetailsPage() {
  const { appointmentId = '' } = useParams();
  const { session, user } = useAuth();
  const valid = z.uuid().safeParse(appointmentId).success;
  const query = useQuery({
    queryKey: queryKeys.appointments.detail(user!.id, appointmentId),
    queryFn: ({ signal }) =>
      appointmentsApi.detail(session, appointmentId, signal),
    enabled: valid,
  });
  if (!valid)
    return (
      <EmptyState
        title="Cita no encontrada"
        description="Comprueba el enlace o vuelve a Mis citas."
      />
    );
  if (query.isPending) return <Loading label="Cargando la cita…" />;
  if (query.isError)
    return (
      <>
        <ErrorMessage
          error={query.error}
          onRetry={() => void query.refetch()}
        />
        <Link to="/dashboard/appointments">Volver a Mis citas</Link>
      </>
    );
  return <AppointmentDetails key={appointmentId} appointment={query.data} />;
}
function AppointmentDetails({
  appointment,
}: {
  appointment: AppointmentDetail;
}) {
  const { session, user } = useAuth();
  const cache = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [notice, setNotice] = useState('');
  const cancelLock = useRef(false);
  const reviewLock = useRef(false);
  const detailKey = queryKeys.appointments.detail(user!.id, appointment.id);
  const cancel = useMutation({
    mutationFn: () => appointmentsApi.cancel(session, appointment.id),
  });
  const review = useMutation({
    mutationFn: (input: ReviewInput) =>
      appointmentsApi.review(session, appointment.id, input),
  });
  const owned = appointment.customerId === user!.id;
  const canCancel =
    owned && ['PENDING', 'CONFIRMED'].includes(appointment.status);
  const hasReview = appointment.hasReview || reviewDone;
  async function cancelAppointment() {
    if (cancelLock.current) return;
    cancelLock.current = true;
    try {
      const data = await cancel.mutateAsync();
      cache.setQueryData(detailKey, { ...appointment, ...data });
      setNotice('Tu cita fue cancelada.');
      void cache.invalidateQueries({ queryKey: queryKeys.appointments.all });
      void cache.invalidateQueries({
        queryKey: ['availability', appointment.business.id],
      });
    } catch {
      /* The mutation renders the API error. */
    } finally {
      setConfirming(false);
      cancelLock.current = false;
    }
  }
  async function publish(input: ReviewInput) {
    if (reviewLock.current || hasReview) return;
    reviewLock.current = true;
    try {
      await review.mutateAsync(input);
      setNotice('Gracias. Tu reseña fue publicada.');
      setReviewDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'REVIEW_ALREADY_EXISTS') {
        setReviewDone(true);
        setNotice('Ya dejaste una reseña para esta cita.');
        review.reset();
      } else {
        reviewLock.current = false;
        return;
      }
    }
    cache.setQueryData(detailKey, { ...appointment, hasReview: true });
    void cache.invalidateQueries({ queryKey: queryKeys.appointments.all });
    void cache.invalidateQueries({
      queryKey: queryKeys.reviews(appointment.business.id),
    });
    setReviewing(false);
    reviewLock.current = false;
  }
  const { business, service, employee } = appointment;
  return (
    <>
      <Link className="back-link" to="/dashboard/appointments">
        ← Mis citas
      </Link>
      <h1>Detalle de tu cita</h1>
      <AppointmentStatusBadge status={appointment.status} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <dl className="booking-summary appointment-section">
        {appointment.priceAtBooking !== undefined && (
          <div>
            <dt>Importe reservado</dt>
            <dd>{appointment.priceAtBooking}</dd>
          </div>
        )}
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
          <dd>
            {appointmentDate(appointment.startTime, business.timeZone, 'date')}
          </dd>
        </div>
        <div>
          <dt>Inicio</dt>
          <dd>
            {appointmentDate(appointment.startTime, business.timeZone, 'time')}
          </dd>
        </div>
        <div>
          <dt>Final</dt>
          <dd>
            {appointmentDate(appointment.endTime, business.timeZone, 'time')}
          </dd>
        </div>
        <div>
          <dt>Zona horaria</dt>
          <dd>{business.timeZone}</dd>
        </div>
        <div>
          <dt>Notas</dt>
          <dd className="appointment-notes">
            {appointment.notes || 'Sin notas.'}
          </dd>
        </div>
      </dl>
      <Link className="text-link" to={`/businesses/${business.id}`}>
        Ir al negocio ↗
      </Link>
      {cancel.isError && (
        <ErrorMessage
          error={cancel.error}
          onRetry={() => void cache.invalidateQueries({ queryKey: detailKey })}
        />
      )}
      {canCancel && (
        <div className="appointment-section">
          <Button
            variant="secondary"
            onClick={() => setConfirming(true)}
            disabled={cancel.isPending}
          >
            Cancelar cita
          </Button>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          busy={cancel.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => void cancelAppointment()}
        />
      )}
      {hasReview &&
        owned &&
        notice !== 'Ya dejaste una reseña para esta cita.' && (
          <p className="notice">Ya dejaste una reseña para esta cita.</p>
        )}
      {owned && appointment.status === 'COMPLETED' && !hasReview && (
        <section className="appointment-section">
          <h2>Tu experiencia cuenta</h2>
          {review.isError && <ErrorMessage error={review.error} />}
          {reviewing ? (
            <ReviewForm
              busy={review.isPending}
              onSubmit={(input) => void publish(input)}
            />
          ) : (
            <Button onClick={() => setReviewing(true)}>Dejar reseña</Button>
          )}
        </section>
      )}
    </>
  );
}
