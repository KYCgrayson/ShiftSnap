import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

async function run() {
const require = Module.createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const servicePath = path.resolve(here, '../src/services/calendarSync.ts');
const originalLoad = Module._load;
let events = [];
let failNextCreate = false;
const nativeCalendar = {
  EntityTypes: { EVENT: 'event' },
  SourceType: { CALDAV: 'caldav', LOCAL: 'local', SUBSCRIBED: 'subscribed', BIRTHDAYS: 'birthdays' },
  CalendarAccessLevel: { OWNER: 'owner' },
  getEventsAsync: async (_calendarIds, start, end) => events.filter((event) => {
    const date = new Date(event.startDate);
    return date >= start && date <= end;
  }),
  updateEventAsync: async (id, details) => {
    const index = events.findIndex((event) => event.id === id);
    if (index < 0) throw new Error('missing event');
    events[index] = { ...events[index], ...details };
  },
  createEventAsync: async (calendarId, details) => {
    if (failNextCreate) {
      failNextCreate = false;
      throw new Error('simulated create failure');
    }
    const id = `native-${events.length + 1}`;
    events.push({ ...details, id, calendarId });
    return id;
  },
  deleteEventAsync: async (id) => { events = events.filter((event) => event.id !== id); },
};

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  module._compile(output, filename);
};
Module._load = function(request, parent, isMain) {
  if (request === 'expo-calendar') return nativeCalendar;
  if (request === 'react-native') return { Platform: { OS: 'ios' } };
  return originalLoad.call(this, request, parent, isMain);
};

const { reconcileShiftsToCalendar } = require(servicePath);
const results = [];
const record = (name, details = {}) => results.push({ name, passed: true, ...details });
const baseShift = (overrides = {}) => ({
  id: 'shift-1', user_id: 'user-a', date: '2026-10-12', shift_code: 'D',
  start_time: '09:00', end_time: '17:00', is_day_off: false,
  calendar_event_id: null, name_on_schedule: 'Alex', ...overrides,
});
const ownedEvent = (id, owner, shiftId, date = '2026-10-12') => ({
  id, title: 'Old title', startDate: new Date(`${date}T09:00:00`), endDate: new Date(`${date}T17:00:00`),
  allDay: false, calendarId: 'calendar-1', notes: `IShift - D\nIShift-Sync-Key: IShift:v2:${owner}:${shiftId}`,
});
const range = { startDate: '2026-10-01', endDate: '2026-10-31', userId: 'user-a' };

try {
  // 1. Correctly identify and remove a stale current-user event.
  events = [ownedEvent('stale-a', 'user-a', 'old-shift')];
  const removed = await reconcileShiftsToCalendar([], [], 'calendar-1', range);
  assert.equal(removed.deleted, 1);
  assert.equal(events.length, 0);
  record('ownership-key parsing and scoped stale deletion', { deleted: removed.deleted });

  // 2. Repeated reconciliation and title mode updates reuse the event.
  events = [];
  const first = await reconcileShiftsToCalendar([baseShift()], [{ code: 'D', meaning: 'Day' }], 'calendar-1', range);
  const firstId = first.eventIdsByShiftId.get('shift-1');
  const second = await reconcileShiftsToCalendar([baseShift()], [{ code: 'D', meaning: 'Day' }], 'calendar-1', range);
  assert.equal(second.updated, 1);
  assert.equal(events.length, 1);
  assert.equal(second.eventIdsByShiftId.get('shift-1'), firstId);
  assert.equal(events[0].title, 'Day (D) · Alex');
  const shiftOnly = await reconcileShiftsToCalendar([baseShift()], [{ code: 'D', meaning: 'Day' }], 'calendar-1', { ...range, titleMode: 'shift_only' });
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Day (D)');
  assert.equal(shiftOnly.eventIdsByShiftId.get('shift-1'), firstId);
  const nameFirst = await reconcileShiftsToCalendar([baseShift()], [{ code: 'D', meaning: 'Day' }], 'calendar-1', { ...range, titleMode: 'name_first' });
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'Alex · Day (D)');
  assert.equal(nameFirst.eventIdsByShiftId.get('shift-1'), firstId);
  record('idempotent sync and title updates', { created: first.created, updated: second.updated + shiftOnly.updated + nameFirst.updated, eventId: firstId, title: events[0].title });

  // 3. Other account events remain untouched during the current account sync.
  events = [ownedEvent('other-b', 'user-b', 'shift-2')];
  const isolated = await reconcileShiftsToCalendar([], [], 'calendar-1', range);
  assert.equal(isolated.deleted, 0);
  assert.equal(events.some((event) => event.id === 'other-b'), true);
  record('account isolation', { remainingEventIds: events.map((event) => event.id) });

  events = [
    ownedEvent('next-month', 'user-a', 'nov-shift', '2026-11-01'),
    { id: 'personal-event', title: 'Dentist', startDate: new Date('2026-10-20T09:00:00'), endDate: new Date('2026-10-20T10:00:00'), allDay: false, calendarId: 'calendar-1', notes: 'Personal appointment' },
  ];
  const bounded = await reconcileShiftsToCalendar([], [], 'calendar-1', range);
  assert.equal(bounded.deleted, 0);
  assert.deepEqual(events.map((event) => event.id).sort(), ['next-month', 'personal-event']);
  record('month bounds and unmanaged event preservation', { remainingEventIds: events.map((event) => event.id).sort() });

  // 4. Day off stays all-day, and 5. overnight time crosses midnight.
  events = [];
  await reconcileShiftsToCalendar([baseShift({ id: 'rest', shift_code: 'R', is_day_off: true })], [], 'calendar-1', range);
  const rest = events.find((event) => event.notes.includes(':rest'));
  assert.equal(rest.allDay, true);
  assert.equal(new Date(rest.endDate).getHours(), 23);
  await reconcileShiftsToCalendar([baseShift({ id: 'night', start_time: '22:00', end_time: '06:00' })], [], 'calendar-1', range);
  const night = events.find((event) => event.notes.includes(':night'));
  assert.equal(new Date(night.endDate).getDate(), 13);
  assert.equal(new Date(night.endDate).getHours(), 6);
  record('day-off and overnight semantics', { dayOffAllDay: rest.allDay, overnightEnd: new Date(night.endDate).toISOString() });

  events = [];
  await reconcileShiftsToCalendar(
    [
      baseShift({ id: 'seconds-ok', start_time: '09:30:59' }),
      baseShift({ id: 'seconds-invalid', start_time: '09:30:60' }),
    ],
    [{ code: 'D', meaning: 'Day', start_time: '10:00', end_time: '18:00' }],
    'calendar-1',
    range,
  );
  const secondsOk = events.find((event) => event.notes.includes(':seconds-ok'));
  const secondsInvalid = events.find((event) => event.notes.includes(':seconds-invalid'));
  assert.equal(new Date(secondsOk.startDate).getHours(), 9);
  assert.equal(new Date(secondsOk.startDate).getMinutes(), 30);
  assert.equal(new Date(secondsInvalid.startDate).getHours(), 10);
  record('time validation and minute precision', {
    validSecondsStart: new Date(secondsOk.startDate).toISOString(),
    invalidSecondsFallbackStart: new Date(secondsInvalid.startDate).toISOString(),
  });

  // 6. A failed native create is reported and does not affect another account.
  events = [
    ownedEvent('other-b', 'user-b', 'shift-2'),
    ownedEvent('stale-a', 'user-a', 'removed-shift'),
  ];
  failNextCreate = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  const failed = await reconcileShiftsToCalendar([baseShift()], [], 'calendar-1', range);
  console.error = originalConsoleError;
  assert.equal(failed.failed, 1);
  assert.equal(events.some((event) => event.id === 'other-b'), true);
  assert.equal(events.some((event) => event.id === 'stale-a'), true);
  assert.equal(failed.deleted, 0);
  record('native write failure preserves existing events', { failed: failed.failed, deleted: failed.deleted, remainingEventIds: events.map((event) => event.id) });

  const artifact = {
    harness: 'calendar-reconcile.integration.mjs',
    executedAt: new Date().toISOString(),
    boundary: 'Expo Calendar mocked; real calendarSync reconciliation invoked',
    results,
    finalEventSnapshot: events.map(({ id, title, notes }) => ({ id, title, notes })),
  };
  const outDir = path.join(here, 'artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'calendar-reconcile-latest.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
} finally {
  Module._load = originalLoad;
}
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
