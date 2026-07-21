import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestCalendarPermissions,
  getOrCreateShiftSnapCalendar,
  getWritableCalendars as getWritableCalendarDestinations,
  isWritableCalendar,
  syncShiftToCalendar,
  CALENDAR_ACCOUNT_READONLY,
  reconcileShiftsToCalendar,
  removeManagedEventsForUser,
  type CalendarShiftForSync,
  type CalendarShiftCodeForSync,
  type CalendarSyncDateRange,
  type CalendarSyncResult,
  type CalendarRemovalResult,
  type WritableCalendarDestination,
} from '../services/calendarSync';
import { supabase } from '../services/supabase';
import { useShiftCodeStore } from './shiftCodeStore';
import { useShiftStore } from './shiftStore';
import { DEFAULT_ALARM_MINUTES } from '@shiftsnap/shared';

const CALENDAR_DESTINATION_KEY_PREFIX = 'shiftsnap_calendar_destination:';
const CALENDAR_CONNECTED_KEY_PREFIX = 'shiftsnap_calendar_connected:';
const CALENDAR_ALARMS_KEY_PREFIX = 'shiftsnap_calendar_alarms_enabled:';
export const ALARM_MINUTES_KEY = 'shiftsnap_default_alarm_minutes';
const CALENDAR_SYNC_FILTER_KEY_PREFIX = 'shiftsnap_calendar_sync_filter:';
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
  /** Account that owns the in-memory connection state. */
  activeUserId: string | null;
  loading: boolean;
  error: string | null;

  initialize: (userId?: string) => Promise<void>;
  getWritableCalendars: () => Promise<WritableCalendarDestination[]>;
  connectCalendar: (userId?: string, destinationId?: string) => Promise<boolean>;
  disconnectCalendar: (userId?: string) => Promise<void>;
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

function destinationKey(userId: string): string {
  return `${CALENDAR_DESTINATION_KEY_PREFIX}${userId}`;
}

function connectedKey(userId: string): string {
  return `${CALENDAR_CONNECTED_KEY_PREFIX}${userId}`;
}

export function calendarAlarmsKey(userId: string): string {
  return `${CALENDAR_ALARMS_KEY_PREFIX}${userId}`;
}

export function calendarSyncFilterKey(userId: string): string {
  return `${CALENDAR_SYNC_FILTER_KEY_PREFIX}${userId}`;
}

async function resolveCalendarId(userId: string | undefined, currentId: string | null): Promise<string | null> {
  try {
    // A destination is account-owned state. Never borrow the in-memory ID
    // while resolving a specific user: on a shared device it may belong to
    // the previously signed-in account.
    const candidate = userId ? await AsyncStorage.getItem(destinationKey(userId)) : currentId;
    if (candidate && await isWritableCalendar(candidate)) return candidate;
    // Do not fall back to an arbitrary personal calendar. A dedicated IShift
    // calendar is safe to share because event ownership is encoded in its
    // per-user sync keys.
    return getOrCreateShiftSnapCalendar();
  } catch {
    // Permission may have been revoked or a provider account removed. Callers
    // treat null as disconnected instead of letting a native error escape.
    return null;
  }
}

async function persistEventIds(eventIdsByShiftId: Map<string, string>): Promise<void> {
  const { updateShiftCalendarSync } = useShiftStore.getState();
  for (const [shiftId, eventId] of eventIdsByShiftId) {
    if (!shiftId || shiftId.startsWith('g-')) continue;
    await updateShiftCalendarSync(shiftId, eventId);
  }
}

async function getCalendarAlarmMinutes(userId?: string): Promise<number | null> {
  if (!userId) return null;
  const enabled = await AsyncStorage.getItem(calendarAlarmsKey(userId));
  if (enabled !== 'true') return null;

  const rawMinutes = await AsyncStorage.getItem(ALARM_MINUTES_KEY);
  const minutes = rawMinutes ? Number(rawMinutes) : DEFAULT_ALARM_MINUTES;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ALARM_MINUTES;
}

async function getCalendarSyncFilter(userId: string): Promise<CalendarSyncFilter> {
  const value = await AsyncStorage.getItem(calendarSyncFilterKey(userId));
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
  activeUserId: null,
  loading: false,
  error: null,

  initialize: async (userId) => {
    if (!userId) {
      set({ isConnected: false, calendarId: null, activeUserId: null, error: null });
      return;
    }
    // Reset immediately so a previous account's connection cannot be used
    // while this account's persisted state is loading.
    set({ isConnected: false, calendarId: null, activeUserId: userId, error: null });
    try {
      const [connected, savedDestinationId] = await Promise.all([
        AsyncStorage.getItem(connectedKey(userId)),
        AsyncStorage.getItem(destinationKey(userId)),
      ]);
      const validId = savedDestinationId && await isWritableCalendar(savedDestinationId)
        ? savedDestinationId
        : null;
      if (get().activeUserId !== userId) return;
      set({
        isConnected: connected === 'true' && !!validId,
        calendarId: validId,
      });
    } catch {
      // Silently fail
    }
  },

  getWritableCalendars: async () => {
    const granted = await requestCalendarPermissions();
    if (!granted) throw new Error('Calendar permission denied');
    return getWritableCalendarDestinations();
  },

  connectCalendar: async (userId, destinationId) => {
    if (!userId) {
      set({ loading: false, error: 'Missing calendar account' });
      return false;
    }
    set({ isConnected: false, calendarId: null, activeUserId: userId });
    set({ loading: true, error: null });
    try {
      const granted = await requestCalendarPermissions();
      if (!granted) {
        set({ loading: false, error: 'Calendar permission denied' });
        return false;
      }

      const calendarId = destinationId && await isWritableCalendar(destinationId)
        ? destinationId
        : await resolveCalendarId(userId, get().calendarId);
      if (!calendarId) {
        set({ loading: false, error: 'Failed to create calendar' });
        return false;
      }

      await AsyncStorage.multiSet([
        [connectedKey(userId), 'true'],
        [destinationKey(userId), calendarId],
      ]);

      if (get().activeUserId !== userId) return false;
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

  disconnectCalendar: async (userId) => {
    try {
      if (userId) await AsyncStorage.removeItem(connectedKey(userId));
      set({ isConnected: false, calendarId: null, activeUserId: null });
    } catch {
      // Silently fail
    }
  },

  removeSyncedEvents: async (userId, range) => {
    const { isConnected, activeUserId } = get();
    if (!isConnected || activeUserId !== userId) return null;
    const calendarId = await resolveCalendarId(userId, get().calendarId);
    if (!calendarId) return null;
    if (calendarId !== get().calendarId) {
      await AsyncStorage.setItem(destinationKey(userId), calendarId);
      set({ calendarId, isConnected: true });
    }

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
    const { isConnected, activeUserId } = get();
    if (!isConnected || activeUserId !== shift.user_id) return null;
    const calendarId = await resolveCalendarId(shift.user_id, get().calendarId);
    if (!calendarId) return null;
    if (calendarId !== get().calendarId) {
      await AsyncStorage.setItem(destinationKey(shift.user_id), calendarId);
      set({ calendarId });
    }

    try {
      const alarmMinutes = await getCalendarAlarmMinutes(shift.user_id);
      const eventId = await syncShiftToCalendar(shift, codeInfo, calendarId, alarmMinutes);
      await persistEventIds(new Map([[shift.id, eventId]]));
      return eventId;
    } catch (error) {
      console.error('Error syncing shift to calendar:', error);
      return null;
    }
  },

  syncShifts: async (shifts, shiftCodes, range) => {
    const syncUserId = range?.userId || shifts[0]?.user_id;
    const { isConnected, activeUserId } = get();
    if (!isConnected || !syncUserId || activeUserId !== syncUserId) return null;
    const calendarId = await resolveCalendarId(syncUserId, get().calendarId);
    if (!calendarId) return null;
    if (calendarId !== get().calendarId) {
      if (syncUserId) await AsyncStorage.setItem(destinationKey(syncUserId), calendarId);
      set({ calendarId });
    }

    try {
      const monthRange = getSingleMonthRange({
        ...range,
        startDate: range?.startDate ?? shifts[0]?.date,
      });
      const monthShifts = shifts.filter(
        (shift) => shift.date >= monthRange.startDate && shift.date <= monthRange.endDate,
      );
      const alarmMinutes = await getCalendarAlarmMinutes(syncUserId);
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
    const { isConnected, activeUserId } = get();
    if (!isConnected || activeUserId !== userId) return null;
    const calendarId = await resolveCalendarId(userId, get().calendarId);
    if (!calendarId) {
      set({ isConnected: false, calendarId: null, error: 'No writable calendar available' });
      return null;
    }
    if (calendarId !== get().calendarId) {
      await AsyncStorage.setItem(destinationKey(userId), calendarId);
      set({ calendarId });
    }

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
      const filter = await getCalendarSyncFilter(userId);
      const currentShiftCodes = useShiftCodeStore.getState().shiftCodes;
      const shifts = allShifts.filter((shift) => matchesCalendarSyncFilter(
        shift,
        filter,
        currentShiftCodes.find((code) => code.code === shift.shift_code),
      ));
      const reconcileRange: CalendarSyncDateRange = {
        ...monthRange,
        userId,
        alarmMinutes: await getCalendarAlarmMinutes(userId),
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
