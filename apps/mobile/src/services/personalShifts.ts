import type { Database } from '@shiftsnap/shared/types/database';

type ScheduleShiftDetail = Database['public']['Functions']['get_my_schedule_shift_details']['Returns'][number];

export type { ScheduleShiftDetail };

export interface ResolvedShiftTiming {
  startTime: string | null;
  endTime: string | null;
  isDayOff: boolean;
}

interface ShiftTiming {
  start_time?: string | null;
  end_time?: string | null;
  is_day_off?: boolean | null;
  personal_timing?: ResolvedShiftTiming;
}

interface PersonalShift extends ShiftTiming {
  date: string;
  shift_code: string;
}

function normalizeTime(time?: string | null): string | null {
  const match = time?.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (!match) return null;
  const [, hour, minute, second = '0'] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  return `${hour.padStart(2, '0')}:${minute}`;
}

export function personalShiftTiming(shift: ShiftTiming, code?: ShiftTiming): ResolvedShiftTiming {
  if (shift.personal_timing) return shift.personal_timing;
  return {
    startTime: normalizeTime(shift.start_time) ?? normalizeTime(code?.start_time),
    endTime: normalizeTime(shift.end_time) ?? normalizeTime(code?.end_time),
    isDayOff: Boolean(shift.is_day_off || code?.is_day_off),
  };
}

export function readPersonalShift(detail: ScheduleShiftDetail) {
  return {
    ...detail.shift_row,
    start_time: detail.effective_start_time,
    end_time: detail.effective_end_time,
    is_day_off: detail.effective_is_day_off,
    personal_timing: {
      startTime: normalizeTime(detail.effective_start_time),
      endTime: normalizeTime(detail.effective_end_time),
      isDayOff: detail.effective_is_day_off,
    },
  };
}

export function personalShiftKey(shift: PersonalShift, code?: ShiftTiming): string {
  const { startTime, endTime, isDayOff } = personalShiftTiming(shift, code);
  return JSON.stringify([shift.date, shift.shift_code, isDayOff, isDayOff ? null : startTime, isDayOff ? null : endTime]);
}

export function uniquePersonalShifts<T extends PersonalShift>(
  shifts: T[],
  getCode: (code: string) => ShiftTiming | undefined,
  getScope?: (shift: T) => string,
): T[] {
  const seen = new Set<string>();
  return shifts.filter((shift) => {
    const key = `${getScope?.(shift) ?? ''}|${personalShiftKey(shift, getCode(shift.shift_code))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
