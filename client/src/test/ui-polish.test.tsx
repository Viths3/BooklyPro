import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../components/common/StatusBadge';
import { Select } from '../components/common/Select';
import { SuccessMessage } from '../components/common/Feedback';
import { Input } from '../components/common/ui';
import { BookingStepper } from '../features/booking/BookingSteps';
import { AppointmentCard } from '../features/appointments/AppointmentCard';
import { MemoryRouter } from 'react-router-dom';
describe('shared UI accessibility', () => {
  it.each([
    ['PENDING', 'Pendiente'],
    ['CONFIRMED', 'Confirmada'],
    ['COMPLETED', 'Completada'],
    ['CANCELLED', 'Cancelada'],
    ['NO_SHOW', 'No asistió'],
    ['ACTIVE', 'Activo'],
    ['INACTIVE', 'Inactivo'],
  ] as const)('labels %s without relying on color', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeVisible();
  });
  it('associates a select label and error', () => {
    render(
      <Select id="team" label="Profesional" error="Elige una opción">
        <option value="">Elegir</option>
      </Select>,
    );
    expect(screen.getByLabelText('Profesional')).toHaveAccessibleDescription(
      'Elige una opción',
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
  it('announces successful mutations', () => {
    render(<SuccessMessage>Guardado</SuccessMessage>);
    expect(screen.getByRole('status')).toHaveTextContent('Guardado');
  });
  it('keeps required fields labeled and described', () => {
    render(<Input id="name" label="Nombre" required />);
    expect(screen.getByLabelText('Nombre')).toBeRequired();
    expect(screen.getByLabelText('Nombre')).toHaveAccessibleDescription(
      'Obligatorio',
    );
  });
  it('marks exactly one current booking step', () => {
    render(<BookingStepper step={2} />);
    const rows = screen.getAllByRole('listitem');
    expect(
      rows.filter((row) => row.getAttribute('aria-current') === 'step'),
    ).toHaveLength(1);
    expect(rows[2]).toHaveTextContent('Fecha');
  });
  it('shows historical price without inventing a currency absent from the API', () => {
    render(
      <MemoryRouter>
        <AppointmentCard
          appointment={{
            id: 'a',
            status: 'CONFIRMED',
            priceAtBooking: '8.50',
            startTime: '2099-10-15T15:00:00Z',
            endTime: '2099-10-15T15:30:00Z',
            notes: null,
            business: { id: 'b', name: 'Oliva', timeZone: 'America/Guayaquil' },
            service: { name: 'Corte' },
            employee: { firstName: 'Carlos', lastName: 'Mora' },
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('8.50')).toBeVisible();
    expect(screen.getByText('Confirmada')).toBeVisible();
  });
});
