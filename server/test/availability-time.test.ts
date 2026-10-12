import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dayOfWeek,
  dayBounds,
  generateTimeSlots,
  hasOverlap,
  localDate,
} from '../src/utils/availability-time.js';
const options = {
  date: '2030-01-07',
  timeZone: 'America/Guayaquil',
  startMinutes: 540,
  endMinutes: 600,
  durationMinutes: 30,
  intervalMinutes: 15,
  now: new Date('2030-01-01T00:00:00Z'),
  appointments: [],
};
test('quarter-hour candidates respect duration and end boundary', () => {
  assert.deepEqual(generateTimeSlots(options), [
    { startTime: '09:00', endTime: '09:30' },
    { startTime: '09:15', endTime: '09:45' },
    { startTime: '09:30', endTime: '10:00' },
  ]);
  assert.deepEqual(generateTimeSlots({ ...options, durationMinutes: 60 }), [
    { startTime: '09:00', endTime: '10:00' },
  ]);
  assert.deepEqual(generateTimeSlots({ ...options, durationMinutes: 90 }), []);
});
test('slot step is configurable and anchored to employee start', () => {
  assert.equal(
    generateTimeSlots({ ...options, intervalMinutes: 30 }).length,
    2,
  );
  assert.equal(
    generateTimeSlots({ ...options, startMinutes: 547 })[0]?.startTime,
    '09:07',
  );
  assert.throws(() => generateTimeSlots({ ...options, intervalMinutes: 0 }));
});
test('overlaps are half-open, including partial intersections', () => {
  const busy = { startTime: new Date(100), endTime: new Date(200) };
  for (const [start, end] of [
    [50, 150],
    [100, 200],
    [150, 250],
    [50, 250],
  ])
    assert.equal(hasOverlap(start!, end!, busy), true);
  assert.equal(hasOverlap(0, 100, busy), false);
  assert.equal(hasOverlap(200, 300, busy), false);
});
test('today filters by instant including seconds and preserves exact-now start', () => {
  assert.equal(
    generateTimeSlots({ ...options, now: new Date('2030-01-07T14:00:01Z') })[0]
      ?.startTime,
    '09:15',
  );
  assert.equal(
    generateTimeSlots({ ...options, now: new Date('2030-01-07T14:00:00Z') })[0]
      ?.startTime,
    '09:00',
  );
});
test('calendar weekday and today follow business timezone independently of UTC date', () => {
  assert.equal(dayOfWeek('2030-01-07'), 'MONDAY');
  assert.equal(dayOfWeek('2030-01-06'), 'SUNDAY');
  assert.equal(
    localDate(new Date('2030-01-08T02:00:00Z'), 'America/Guayaquil'),
    '2030-01-07',
  );
  assert.equal(
    localDate(new Date('2030-01-07T12:00:00Z'), 'Pacific/Kiritimati'),
    '2030-01-08',
  );
  assert.equal(
    dayBounds('2030-01-07', 'Asia/Kathmandu').start.toISOString(),
    '2030-01-06T18:15:00.000Z',
  );
});
test('local day bounds account for 23-hour and 25-hour DST days', () => {
  const spring = dayBounds('2030-03-10', 'America/New_York');
  const autumn = dayBounds('2030-11-03', 'America/New_York');
  assert.equal(spring.end.getTime() - spring.start.getTime(), 23 * 3600000);
  assert.equal(autumn.end.getTime() - autumn.start.getTime(), 25 * 3600000);
});
test('nonexistent DST times and intervals with wrong elapsed duration are omitted', () => {
  const slots = generateTimeSlots({
    ...options,
    date: '2030-03-10',
    timeZone: 'America/New_York',
    startMinutes: 60,
    endMinutes: 240,
  });
  assert.ok(slots.length > 0);
  assert.ok(
    slots.every(
      (s) => !s.startTime.startsWith('02:') && !s.endTime.startsWith('02:'),
    ),
  );
  assert.deepEqual(
    generateTimeSlots({
      ...options,
      date: '2030-03-10',
      timeZone: 'America/New_York',
      startMinutes: 90,
      endMinutes: 210,
      durationMinutes: 120,
    }),
    [],
  );
});
test('ambiguous repeated DST endpoints are omitted from HH:mm response', () => {
  const slots = generateTimeSlots({
    ...options,
    date: '2030-11-03',
    timeZone: 'America/New_York',
    startMinutes: 0,
    endMinutes: 180,
  });
  assert.ok(slots.length > 0);
  assert.ok(
    slots.every(
      (s) => !s.startTime.startsWith('01:') && !s.endTime.startsWith('01:'),
    ),
  );
});
test('legacy end-of-day 1440 maps to next local midnight', () => {
  assert.deepEqual(
    generateTimeSlots({ ...options, startMinutes: 1410, endMinutes: 1440 }),
    [{ startTime: '23:30', endTime: '24:00' }],
  );
});
