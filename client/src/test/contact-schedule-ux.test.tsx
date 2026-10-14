import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwnerForm } from '../features/owner/OwnerForm';
import { countries, normalizePhone, phoneParts } from '../lib/phone';
import { copyMonday, scheduleSchema } from '../features/owner/SchedulesPage';
import { days } from '../features/owner/api';
const initial = {
  name: 'Oliva',
  description: '',
  address: '',
  imageUrl: '',
  phone: '',
};
function setup(phone = '') {
  const save = vi.fn();
  render(
    <OwnerForm
      kind="business"
      initial={{ ...initial, phone }}
      busy={false}
      onSave={save}
      onClose={() => {}}
    />,
  );
  return save;
}
describe('international phone', () => {
  it('defaults to Ecuador without limiting country choices', () => {
    setup();
    expect(screen.getByLabelText('País del teléfono')).toHaveValue('EC');
    expect(countries.length).toBeGreaterThan(200);
    expect(
      screen.getByRole('option', { name: 'Francia +33' }),
    ).toBeInTheDocument();
  });
  it('submits Ecuador in E.164', async () => {
    const save = setup();
    await userEvent.type(screen.getByLabelText('Teléfono'), '098 765 4321');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+593987654321' }),
    );
    expect(save.mock.calls[0]![0]).not.toHaveProperty('phoneCountry');
  });
  it('changes country and normalizes France', async () => {
    const save = setup();
    await userEvent.selectOptions(
      screen.getByLabelText('País del teléfono'),
      'FR',
    );
    await userEvent.type(screen.getByLabelText('Teléfono'), '06 12 34 56 78');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+33612345678' }),
    );
  });
  it('accepts an optional empty phone', async () => {
    const save = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ phone: null }));
  });
  it('parses country and local part while editing', () => {
    setup('+33612345678');
    expect(screen.getByLabelText('País del teléfono')).toHaveValue('FR');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('612345678');
  });
  it('shows useful field error for duplicate prefix', async () => {
    const save = setup();
    fireEvent.change(screen.getByLabelText('Teléfono'), {
      target: { value: '+593+593987654321' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(save).not.toHaveBeenCalled();
  });
  it('preserves unrecognized legacy phone when editing unrelated fields', async () => {
    const save = setup('123-456');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(save.mock.calls[0]![0]).not.toHaveProperty('phone');
  });
  it('validates a changed legacy phone instead of silently preserving it', async () => {
    const save = setup('123-456');
    fireEvent.change(screen.getByLabelText('Teléfono'), {
      target: { value: 'abc123' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(save).not.toHaveBeenCalled();
  });
  it.each(['abc123', '++++', '123', '+593+593987654321', '593593987654321'])(
    'rejects clearly invalid %s',
    (input) => expect(() => normalizePhone(input, 'EC')).toThrow(),
  );
  it('accepts pasted international number without doubling the prefix', () =>
    expect(normalizePhone('+593 98 765 4321', 'EC')).toBe('+593987654321'));
  it('rejects country mismatch', () =>
    expect(() => normalizePhone('+33612345678', 'EC')).toThrow());
  it('preserves unidentified international numbers as legacy', () =>
    expect(phoneParts('+80012345678').legacy).toBe(true));
});
const week = (start = '09:00', end = '18:00') => ({
  days: days.map((dayOfWeek) => ({ dayOfWeek, active: true, start, end })),
});
describe('schedule editing assistance', () => {
  it('copies weekdays without touching Monday, weekends or input object', () => {
    const source = week();
    source.days[0]!.start = '10:00';
    const copied = copyMonday(source);
    expect(copied.days.slice(0, 5).every((d) => d.start === '10:00')).toBe(
      true,
    );
    expect(copied.days[5]!.start).toBe('09:00');
    expect(source.days[1]!.start).toBe('09:00');
  });
  it('accepts contained employee hours', () =>
    expect(
      scheduleSchema(week()).safeParse(week('10:00', '17:00')).success,
    ).toBe(true));
  it('explains employee hours outside the business interval', () => {
    const result = scheduleSchema(week()).safeParse(week('08:00', '17:00'));
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toContain('09:00–18:00');
  });
  it('explains closed business days', () => {
    const business = week();
    business.days[0]!.active = false;
    const result = scheduleSchema(business).safeParse(week());
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toContain('cerrado');
  });
  it('permits inactive employee days outside opening hours', () => {
    const employee = week('07:00', '20:00');
    employee.days.forEach((day) => (day.active = false));
    expect(scheduleSchema(week()).safeParse(employee).success).toBe(true);
  });
});
