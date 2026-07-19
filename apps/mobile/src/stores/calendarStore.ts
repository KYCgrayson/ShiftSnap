import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestCalendarPermissions,
  getOrCreateShiftSnapCalendar,
  syncShiftToCalendar,
  CALENDAR_ACCOUNT_READONLY,
  reconcileShiftsToCalendar,
  removeManagedEventsForUser,
  type CalendarShiftForSync,
  type CalendarShiftCodeForSync,
  type CalendarSyncDateRange,
  type CalendarSyncResult,
  type CalendarRemovalResult,
} from '../services/calendarSync';
import { supabase } from '../services/supabase';
import { useShiftCodeStore } from './shiftCodeStore';
import { useShiftStore } from './shiftStore';
import { DEFAULT_ALARM_MINUTES } from '@shiftsnap/shared';

const CALENDAR_CONNECTED_KEY = 'shiftsnap_calendar_connected';
const CALENDAR_ID_KEY = 'shiftsnap_calendar_id';
export const CALENDAR_ALARMS_KEY = 'shiftsnap_calendar_alarms_enabled';
export const ALARM_MINUTES_KEY = 'shiftsnap_default_alarm_minutes';
export const CALENDAR_SYNC_FILTER_KEY = 'shiftsnap_calendar_sync_filter';
export type CalendarSyncFilter = 'all' | 'work_days' | 'days_off';

function getSingleMonthRange(
  range?: CalendarSyncDateRange,
): CalendarSyncDateRange & Required<Pick<CalendarSyncDateRange, 'startDate' | 'endDate'>> {
  const today = new Date();
  const fallbackYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const referenceDate = range?.startDate || range?.endDate || `${fallbackYearMonth}-01`;
  const match = /^(\d{4})-(\d{2})/.exec(referenceDate);
  const year = match ? Number(match[1]) : today.getFullYear();
  const month = match ? Number(match[2]) : today.getMonth() + 1;
  const safeYear = Number.isFinite(year) ? year : today.getFullYear();
  const safeMonth = month >= 1 && month <= 12 ? month : today.getMonth() + 1;
  const yearMonth = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
  const lastDay = new Date(safeYear, safeMonth, 0).getDate();

  return {
    ...range,
    startDate: `${yearMonth}-01`,
    endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  };
}

interface CalendarState {
  isConnected: boolean;
  calendarId: string | null;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  connectCalendar: () => Promise<boolean>;
  disconnectCalendar: () => Promise<void>;
  removeSyncedEvents: (
    userId: string,
    range?: CalendarSyncDateRange,
  ) => Promise<CalendarRemovalResult | null>;
  syncShift: (
    shift: CalendarShiftForSync,
    codeInfo: CalendarShiftCodeForSync | undefined
  ) => Promise<string | null>;
  syncShifts: (
    shifts: CalendarShiftForSync[],
    shiftCodes: CalendarShiftCodeForSync[],
    range?: CalendarSyncDateRange
  ) => Promise<CalendarSyncResult | null>;
  syncUserShifts: (userId: string, range?: CalendarSyncDateRange) => Promise<CalendarSyncResult | null>;
}

async function persistEventIds(eventIdsByShiftId: Map<string, string>): Promise<void> {
  const { updateShiftCalendarSync } = useShiftStore.getState();
  for (const [shiftId, eventId] of eventIdsByShiftId) {
    if (!shiftId || shiftId.startsWith('g-')) continue;
    await updateShiftCalendarSync(shiftId, eventId);
  }
}

async function getCalendarAlarmMinutes(): Promise<number | null> {
  const enabled = await AsyncStorage.getItem(CALENDAR_ALARMS_KEY);
  if (enabled !== 'true') return null;

  const rawMinutes = await AsyncStorage.getItem(ALARM_MINUTES_KEY);
  const minutes = rawMinutes ? Number(rawMinutes) : DEFAULT_ALARM_MINUTES;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ALARM_MINUTES;
}

async function getCalendarSyncFilter(): Promise<CalendarSyncFilter> {
  const value = await AsyncStorage.getItem(CALENDAR_SYNC_FILTER_KEY);
  return value === 'work_days' || value === 'days_off' ? value : 'all';
}

function matchesCalendarSyncFilter(
  shift: CalendarShiftForSync,
  filter: CalendarSyncFilter,
  codeInfo?: CalendarShiftCodeForSync,
): boolean {
  const isDayOff = shift.is_day_off || codeInfo?.is_day_off || false;
  if (filter === 'work_days') return !isDayOff;
  if (filter === 'days_off') return isDayOff;
  return true;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  isConnected: false,
  calendarId: null,
  loading: false,
  error: null,

  initialize: async () => {
    try {
      const connected = await AsyncStorage.getItem(CALENDAR_CONNECTED_KEY);
      const calendarId = await AsyncStorage.getItem(CALENDAR_ID_KEY);
      set({
        isConnected: connected === 'true',
        calendarId,
      });
    } catch {
      // Silently fail
    }
  },

  connectCalendar: async () => {
    set({ loading: true, error: null });
    try {
      const granted = await requestCalendarPermissions();
      if (!granted) {
        set({ loading: false, error: 'Calendar permission denied' });
        return false;
      }

      const calendarId = await getOrCreateShiftSnapCalendar();
      if (!calendarId) {
        set({ loading: false, error: 'Failed to create calendar' });
        return false;
      }

      await AsyncStorage.setItem(CALENDAR_CONNECTED_KEY, 'true');
      await AsyncStorage.setItem(CALENDAR_ID_KEY, calendarId);

      set({ isConnected: true, calendarId, loading: false });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect calendar';
      // Normalize the "no source will accept a new calendar" case so the UI
      // can show an actionable message instead of a raw native error.
      const normalized =
        message === CALENDAR_ACCOUNT_READONLY ? CALENDAR_ACCOUNT_READONLY : message;
      set({ loading: false, error: normalized });
      return false;
    }
  },

  disconnectCalendar: async () => {
    try {
      await AsyncStorage.removeItem(CALENDAR_CONNECTED_KEY);
      await AsyncStorage.removeItem(CALENDAR_ID_KEY);
      set({ isConnected: false, calendarId: null });
    } catch {
      // Silently fail
    }
  },

  removeSyncedEvents: async (userId, range) => {
    const { calendarId } = get();
    if (!calendarId) return null;

    set({ loading: true, error: null });
    try {
      const result = await removeManagedEventsForUser(
        calendarId,
        userId,
        getSingleMonthRange(range),
      );
      set({ loading: false });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove calendar events';
      set({ loading: false, error: message });
      return null;
    }
  },

  syncShift: async (shift, codeInfo) => {
    const { isConnected, calendarId } = get();
    if (!isConnected || !calendarId) return null;

    try {
      const alarmMinutes = await getCalendarAlarmMinutes();
      const eventId = await syncShiftToCalendar(shift, codeInfo, calendarId, alarmMinutes);
      await persistEventIds(new Map([[shift.id, eventId]]));
      return eventId;
    } catch (error) {
      console.error('Error syncing shift to calendar:', error);
      return null;
    }
  },

  syncShifts: async (shifts, shiftCodes, range) => {
    const { isConnected, calendarId } = get();
    if (!isConnected || !calendarId) return null;

    try {
      const monthRange = getSingleMonthRange({
        ...range,
        startDate: range?.startDate ?? shifts[0]?.date,
      });
      const monthShifts = shifts.filter(
        (shift) => shift.date >= monthRange.startDate && shift.date <= monthRange.endDate,
      );
      const alarmMinutes = await getCalendarAlarmMinutes();
      const result = await reconcileShiftsToCalendar(
        monthShifts,
        shiftCodes,
        calendarId,
        { ...monthRange, alarmMinutes },
      );
      await persistEventIds(result.eventIdsByShiftId);
      return result;
    } catch (error) {
      console.error('Error reconciling shifts to calendar:', error);
      return null;
    }
  },

  syncUserShifts: async (userId, range) => {
    const { isConnected, calendarId } = get();
    if (!isConnected || !calendarId) return null;

    try {
      const monthRange = getSingleMonthRange(range);
      const codeStore = useShiftCodeStore.getState();
      if (codeStore.shiftCodes.length === 0) {
        await codeStore.fetchShiftCodes(userId);
      }

      const { data, error } = await supabase.rpc('get_my_schedule_shifts', {
        p_start_date: monthRange.startDate,
        p_end_date: monthRange.endDate,
      });
      if (error) throw error;

      const allShifts = (data || []) as CalendarShiftForSync[];
      const filter = await getCalendarSyncFilter();
      const currentShiftCodes = useShiftCodeStore.getState().shiftCodes;
      const shifts = allShifts.filter((shift) => matchesCalendarSyncFilter(
        shift,
        filter,
        currentShiftCodes.find((code) => code.code === shift.shift_code),
      ));
      const reconcileRange: CalendarSyncDateRange = {
        ...monthRange,
        userId,
        alarmMinutes: await getCalendarAlarmMinutes(),
      };

      const result = await reconcileShiftsToCalendar(
        shifts,
        currentShiftCodes,
        calendarId,
        reconcileRange,
      );
      // calendar_event_id is a single legacy column and cannot represent the
      // same canonical shift synced by several accounts/devices. Persist only
      // events whose canonical shift is owned by the current account; shared
      // rows are reconciled through the per-user sync key stored in the event.
      const ownedShiftIds = new Set(
        shifts.filter((shift) => shift.user_id === userId).map((shift) => shift.id),
      );
      const ownedEventIds = new Map(
        [...result.eventIdsByShiftId].filter(([shiftId]) => ownedShiftIds.has(shiftId)),
      );
      await persistEventIds(ownedEventIds);
      return result;
    } catch (error) {
      console.error('Error syncing user shifts to calendar:', error);
      return null;
    }
  },
}));
