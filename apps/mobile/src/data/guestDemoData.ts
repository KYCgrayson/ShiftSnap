/**
 * Demo data for guest mode.
 * Shifts are generated dynamically so "today" always has data.
 */

import { formatDateISO, formatYearMonth } from '@shiftsnap/shared';

// ─── Shift Codes ──────────────────────────────────────────────

export interface GuestShiftCode {
  id: string;
  code: string;
  meaning: string;
  start_time: string | null;
  end_time: string | null;
  is_day_off: boolean;
  is_confirmed: boolean;
  group_id: string | null;
  is_group_shared: boolean;
}

export const GUEST_SHIFT_CODES: GuestShiftCode[] = [
  { id: 'g-sc-1', code: 'A', meaning: 'Morning shift', start_time: '06:00', end_time: '14:00', is_day_off: false, is_confirmed: true, group_id: 'guest-group', is_group_shared: true },
  { id: 'g-sc-2', code: 'B', meaning: 'Afternoon shift', start_time: '14:00', end_time: '22:00', is_day_off: false, is_confirmed: true, group_id: 'guest-group', is_group_shared: true },
  { id: 'g-sc-3', code: 'C', meaning: 'Night shift', start_time: '22:00', end_time: '06:00', is_day_off: false, is_confirmed: true, group_id: 'guest-group', is_group_shared: true },
  { id: 'g-sc-4', code: 'X', meaning: 'Day off', start_time: null, end_time: null, is_day_off: true, is_confirmed: true, group_id: 'guest-group', is_group_shared: true },
];

// ─── Shift Generation ─────────────────────────────────────────

export interface GuestShift {
  id: string;
  schedule_id: string;
  user_id: string;
  person_id: string | null;
  date: string;
  shift_code: string;
  start_time: string | null;
  end_time: string | null;
  is_day_off: boolean;
  source: string;
  name_on_schedule: string | null;
  comparison_status: string | null;
  calendar_event_id: string | null;
  synced_at: string | null;
}

const ROTATION = ['A', 'A', 'B', 'B', 'C', 'C', 'X'] as const;

function codeForIndex(i: number): typeof ROTATION[number] {
  return ROTATION[((i % ROTATION.length) + ROTATION.length) % ROTATION.length];
}

function infoForCode(code: string) {
  return GUEST_SHIFT_CODES.find((sc) => sc.code === code)!;
}

/** Generate shifts for an entire month. Day 1 of the current month anchors the rotation. */
export function generateGuestShiftsForMonth(yearMonth: string): GuestShift[] {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Anchor: day-of-year of the 1st of this month determines rotation offset
  const jan1 = new Date(year, 0, 1);
  const monthStart = new Date(year, month - 1, 1);
  const dayOfYear = Math.floor((monthStart.getTime() - jan1.getTime()) / 86_400_000);

  const shifts: GuestShift[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const code = codeForIndex(dayOfYear + day - 1);
    const info = infoForCode(code);
    const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
    shifts.push({
      id: `g-shift-${yearMonth}-${day}`,
      schedule_id: 'g-schedule-1',
      user_id: 'guest-user',
      person_id: null,
      date: dateStr,
      shift_code: code,
      start_time: info.start_time,
      end_time: info.end_time,
      is_day_off: info.is_day_off,
      source: 'self_scan',
      name_on_schedule: null,
      comparison_status: null,
      calendar_event_id: null,
      synced_at: null,
    });
  }

  return shifts;
}

/** Get today's guest shift. */
export function getGuestTodayShift(): GuestShift | null {
  const today = formatDateISO(new Date());
  const yearMonth = formatYearMonth(new Date());
  const shifts = generateGuestShiftsForMonth(yearMonth);
  return shifts.find((s) => s.date === today) ?? null;
}

/** Get upcoming guest shifts (today + future, capped). */
export function getGuestUpcomingShifts(limit: number = 5): GuestShift[] {
  const today = formatDateISO(new Date());
  const yearMonth = formatYearMonth(new Date());
  const shifts = generateGuestShiftsForMonth(yearMonth);
  return shifts.filter((s) => s.date >= today).slice(0, limit);
}

// ─── Schedules ────────────────────────────────────────────────

export interface GuestSchedule {
  id: string;
  owner_id: string;
  person_id: string | null;
  image_url: string;
  year_month: string;
  raw_ocr_result: null;
  status: 'published';
  created_at: string;
}

export function getGuestSchedules(): GuestSchedule[] {
  const yearMonth = formatYearMonth(new Date());
  return [
    {
      id: 'g-schedule-1',
      owner_id: 'guest-user',
      person_id: null,
      image_url: '',
      year_month: yearMonth,
      raw_ocr_result: null,
      status: 'published',
      created_at: new Date().toISOString(),
    },
  ];
}

// ─── Persons ──────────────────────────────────────────────────

export interface GuestPerson {
  id: string;
  owner_id: string;
  group_id: string | null;
  name: string;
  color: string;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
}

export function getGuestPersons(): GuestPerson[] {
  return [
    {
      id: 'g-person-1',
      owner_id: 'guest-user',
      group_id: 'guest-group',
      name: 'Me',
      color: '#4F6BFF',
      avatar_url: null,
      notes: null,
      created_at: new Date().toISOString(),
    },
  ];
}
