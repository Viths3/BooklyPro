import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError } from '../../api/client';
import {
  Button,
  EmptyState,
  ErrorMessage,
  Input,
  Loading,
} from '../../components/common/ui';
import { queryKeys } from '../../lib/query';
import { useAuth } from '../auth/AuthProvider';
import { businessApi, type Business } from '../businesses/api';
import { bookingApi } from './api';
import {
  bookingReturnTo,
  dateLabel,
  readSelection,
  todayAt,
  validDate,
} from './model';
import {
  BookingStepper,
  BookingSuccess,
  BookingSummary,
  EmployeeSelector,
  ServiceSelector,
  TimeSlotSelector,
} from './BookingSteps';

export function BookingPage() {
  const { businessId = '' } = useParams();
  const { search } = useLocation();
  const valid = z.uuid().safeParse(businessId).success;
  const business = useQuery({
    queryKey: queryKeys.businesses.detail(businessId),
    queryFn: ({ signal }) => businessApi.detail(businessId, signal),
    enabled: valid,
  });
  if (!valid)
    return (
      <EmptyState
        title="Negocio no encontrado"
        description="Comprueba el enlace antes de reservar."
      />
    );
  if (business.isPending) return <Loading label="Cargando el negocio…" />;
  if (business.isError)
    return (
      <ErrorMessage
        error={business.error}
        onRetry={() => void business.refetch()}
      />
    );
  const item = business.data.data;
  try {
    if (!item.timeZone) throw new Error();
    todayAt(item.timeZone);
  } catch {
    return (
      <EmptyState
        title="No podemos consultar los horarios"
        description="La zona horaria del negocio no está disponible. Contacta con el negocio."
      />
    );
  }
  return (
    <BookingFlow
      key={businessId + search}
      business={item}
      search={search}
      timeZone={item.timeZone}
    />
  );
}
function BookingFlow({
  business,
  search,
  timeZone,
}: {
  business: Business;
  search: string;
  timeZone: string;
}) {
  const [selection, setSelection] = useState(() => readSelection(search));
  const [step, setStep] = useState(() =>
    readSelection(search).startTime ? 4 : 0,
  );
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { serviceId, employeeId, date, startTime } = selection;
  const services = useQuery({
    queryKey: queryKeys.services(business.id),
    queryFn: ({ signal }) => businessApi.services(business.id, signal),
    staleTime: 0,
  });
  const service = services.data?.data.find((item) => item.id === serviceId);
  const employees = useQuery({
    queryKey: queryKeys.bookingEmployees(business.id, serviceId),
    queryFn: ({ signal }) =>
      bookingApi.employees(business.id, serviceId, signal),
    enabled: Boolean(service),
    staleTime: 0,
  });
  const employee = employees.data?.find((item) => item.id === employeeId);
  const dateValid = validDate(date, timeZone);
  const availabilityKey = queryKeys.availability(
    business.id,
    serviceId,
    employeeId,
    date,
  );
  const availability = useQuery({
    queryKey: availabilityKey,
    queryFn: ({ signal }) =>
      bookingApi.availability(
        { businessId: business.id, serviceId, employeeId, date },
        signal,
      ),
    enabled: Boolean(service && employee && dateValid),
    staleTime: 0,
  });
  const slot = availability.data?.slots.find(
    (item) => item.startTime === startTime,
  );
  // Revalidate restored selections against public data before exposing confirmation.
  const visibleStep =
    !service || services.isError
      ? 0
      : !employee || employees.isError
        ? Math.min(step, 1)
        : !dateValid
          ? Math.min(step, 2)
          : !slot
            ? Math.min(step, 3)
            : step;
  useEffect(() => {
    heading.current?.focus();
  }, [visibleStep]);
  const mutation = useMutation({
    mutationFn: (text: string) =>
      bookingApi.create(session, {
        businessId: business.id,
        ...selection,
        ...(text ? { notes: text } : {}),
      }),
  });
  const returnToLogin = () =>
    navigate('/login', {
      state: {
        returnTo: bookingReturnTo(business.id, selection),
        notice:
          'Inicia sesión para continuar con tu reserva. Las notas deberán introducirse de nuevo.',
      },
    });
  async function confirm(text: string) {
    if (
      submitting.current ||
      services.isError ||
      employees.isError ||
      !service ||
      !employee ||
      !dateValid ||
      !slot ||
      availability.isFetching ||
      availability.isError
    )
      return;
    if (!user) {
      returnToLogin();
      return;
    }
    submitting.current = true;
    setNotice('');
    try {
      await mutation.mutateAsync(text);
      void cache.invalidateQueries({ queryKey: ['availability', business.id] });
      void cache.invalidateQueries({ queryKey: ['appointments'] });
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'APPOINTMENT_SLOT_UNAVAILABLE'
      ) {
        setNotice('Este horario acaba de ser reservado. Elige otro horario.');
        setSelection((previous) => ({ ...previous, startTime: '' }));
        setStep(3);
        mutation.reset();
        await cache.invalidateQueries({ queryKey: availabilityKey });
      } else if (error instanceof ApiError && error.status === 401) {
        returnToLogin();
      }
    } finally {
      submitting.current = false;
    }
  }
  function back() {
    setStep(Math.max(0, visibleStep - 1));
    mutation.reset();
    setNotice('');
  }
  const titles = [
    'Elige tu servicio.',
    'Elige a tu profesional.',
    'Haz espacio en tu agenda.',
    'Encuentra tu horario.',
    'Revisa tu reserva.',
  ];
  if (mutation.isSuccess)
    return (
      <section className="container page booking-shell">
        <BookingSuccess
          appointment={mutation.data}
          currency={business.currency}
        />
      </section>
    );
  return (
    <section className="container page booking-shell">
      <Link to={`/businesses/${business.id}`} className="back-link">
        ← Volver al negocio
      </Link>
      <p className="eyebrow">RESERVA EN {business.name}</p>
      <BookingStepper step={visibleStep} />
      <h1 ref={heading} tabIndex={-1}>
        {titles[visibleStep]}
      </h1>
      <p className="muted">Todos los horarios corresponden a {timeZone}.</p>
      {visibleStep > 0 && visibleStep < 4 && (
        <dl className="booking-context" aria-label="Selección de la reserva">
          {service && (
            <div>
              <dt>Servicio</dt>
              <dd>
                {service.name} · {service.price} {business.currency}
              </dd>
            </div>
          )}
          {employee && (
            <div>
              <dt>Profesional</dt>
              <dd>
                {employee.firstName} {employee.lastName}
              </dd>
            </div>
          )}
          {dateValid && (
            <div>
              <dt>Fecha</dt>
              <dd>
                {dateLabel(date)}
                {startTime ? ` · ${startTime}` : ''}
              </dd>
            </div>
          )}
        </dl>
      )}
      {notice && (
        <p role="alert" className="notice">
          {notice}
        </p>
      )}
      {mutation.isError && <ErrorMessage error={mutation.error} />}
      <div className="booking-panel" aria-busy={mutation.isPending}>
        {visibleStep === 0 &&
          (services.isPending ? (
            <Loading label="Cargando servicios…" />
          ) : services.isError ? (
            <ErrorMessage
              error={services.error}
              onRetry={() => void services.refetch()}
            />
          ) : services.data.data.length === 0 ? (
            <EmptyState
              title="No hay servicios disponibles"
              description="Vuelve a consultar más adelante."
            />
          ) : (
            <ServiceSelector
              items={services.data.data}
              currency={business.currency}
              selected={serviceId}
              onSelect={(id) => {
                if (id !== serviceId) {
                  setSelection({
                    serviceId: id,
                    employeeId: '',
                    date: '',
                    startTime: '',
                  });
                  setStep(0);
                }
              }}
            />
          ))}
        {visibleStep === 1 &&
          (employees.isPending ? (
            <Loading label="Consultando profesionales y sus servicios…" />
          ) : employees.isError ? (
            <ErrorMessage
              error={employees.error}
              onRetry={() => void employees.refetch()}
            />
          ) : employees.data.length === 0 ? (
            <EmptyState
              title="No hay profesionales para este servicio"
              description="Puedes volver atrás y elegir otro servicio."
            />
          ) : (
            <EmployeeSelector
              items={employees.data}
              selected={employeeId}
              onSelect={(id) => {
                if (id !== employeeId) {
                  setSelection((previous) => ({
                    ...previous,
                    employeeId: id,
                    startTime: '',
                  }));
                  setStep(1);
                }
              }}
            />
          ))}
        {visibleStep === 2 && (
          <Input
            id="booking-date"
            label="Fecha de la cita"
            type="date"
            min={todayAt(timeZone)}
            value={date}
            onChange={(event) => {
              setSelection((previous) => ({
                ...previous,
                date: event.target.value,
                startTime: '',
              }));
              setStep(2);
            }}
            error={
              date && !dateValid
                ? 'Elige una fecha válida que no sea anterior a hoy en el negocio.'
                : undefined
            }
            hint={
              dateValid
                ? `${dateLabel(date)} · ${timeZone}`
                : `Elige hoy o una fecha posterior en ${timeZone}.`
            }
          />
        )}
        {(visibleStep === 3 || visibleStep === 4) &&
          (availability.isPending || availability.isFetching ? (
            <Loading label="Consultando disponibilidad…" />
          ) : availability.isError ? (
            <ErrorMessage
              error={availability.error}
              onRetry={() => void availability.refetch()}
            />
          ) : visibleStep === 3 ? (
            <>
              <p>
                {dateLabel(date)} · {service?.name}
              </p>
              {availability.data.slots.length === 0 ? (
                <>
                  <EmptyState
                    title="No hay horarios disponibles para esta fecha."
                    description="Vuelve atrás y selecciona otra fecha."
                  />
                  <Button onClick={() => setStep(2)}>Elegir otra fecha</Button>
                </>
              ) : (
                <TimeSlotSelector
                  slots={availability.data.slots}
                  selected={startTime}
                  onSelect={(value) => {
                    setSelection((previous) => ({
                      ...previous,
                      startTime: value,
                    }));
                    setStep(3);
                    setNotice('');
                    mutation.reset();
                  }}
                />
              )}
            </>
          ) : (
            service &&
            employee && (
              <BookingSummary
                business={business}
                service={service}
                employee={employee}
                date={date}
                slot={startTime}
                endTime={slot?.endTime}
                notes={notes}
                onNotes={setNotes}
                onConfirm={(text) => void confirm(text)}
                pending={mutation.isPending}
                authenticated={Boolean(user)}
              />
            )
          ))}
      </div>
      <div className="booking-actions">
        {visibleStep > 0 && (
          <Button
            variant="secondary"
            onClick={back}
            disabled={mutation.isPending}
          >
            Atrás
          </Button>
        )}
        {visibleStep < 4 && (
          <Button
            disabled={
              visibleStep === 0
                ? !service || services.isError
                : visibleStep === 1
                  ? !employee || employees.isError
                  : visibleStep === 2
                    ? !dateValid
                    : !slot || availability.isFetching || availability.isError
            }
            onClick={() => setStep(visibleStep + 1)}
          >
            Continuar
          </Button>
        )}
      </div>
    </section>
  );
}
