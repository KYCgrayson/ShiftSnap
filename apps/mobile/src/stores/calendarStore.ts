import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import i18n from '../i18n';
import {
  requestCalendarPermissions,
  hasCalendarPermissions,
  getOrCreateShiftSnapCalendar,
  getWritableCalendars as getWritableCalendarDestinations,
  getCalendarDestination,
  updateIShiftCalendar,
  CALENDAR_NAME,
  CALENDAR_COLOR,
  CALENDAR_COLORS,
  isWritableCalendar,
  CALENDAR_ACCOUNT_READONLY,
  reconcileShiftsToCalendar,
  removeManagedEventsForUser,
  type CalendarShiftForSync,
  type CalendarShiftCodeForSync,
  type CalendarSyncDateRange,
  type CalendarSyncResult,
  type CalendarRemovalResult,
  type CalendarTitleMode,
  type WritableCalendarDestination,
} from '../services/calendarSync';
import { useAuthStore } from './authStore';
import { supabase } from '../services/supabase';
import { useShiftCodeStore } from './shiftCodeStore';
import { useShiftStore } from './shiftStore';
import { DEFAULT_ALARM_MINUTES } from '@shiftsnap/shared';

const CALENDAR_DESTINATION_KEY_PREFIX = 'shiftsnap_calendar_destination:';
const CALENDAR_CONNECTED_KEY_PREFIX = 'shiftsnap_calendar_connected:';
const CALENDAR_ALARMS_KEY_PREFIX = 'shiftsnap_calendar_alarms_enabled:';
export const ALARM_MINUTES_KEY = 'shiftsnap_default_alarm_minutes';
const CALENDAR_SYNC_FILTER_KEY_PREFIX = 'shiftsnap_calendar_sync_filter:';
const CALENDAR_TITLE_MODE_KEY_PREFIX = 'shiftsnap_calendar_title_mode:';
const CALENDAR_MANAGED_ID_KEY_PREFIX = 'shiftsnap_managed_calendar_id:';
const CALENDAR_NAME_KEY_PREFIX = 'shiftsnap_calendar_name:';
const CALENDAR_COLOR_KEY_PREFIX = 'shiftsnap_calendar_color:';
const CALENDAR_ALARM_MINUTES_KEY_PREFIX = 'shiftsnap_calendar_alarm_minutes:';
export type CalendarSyncFilter = 'all' | 'work_days' | 'days_off';

export interface CalendarExportDraft {
  name: string;
  color: string;
  filter: CalendarSyncFilter;
  titleMode: CalendarTitleMode;
  alarmsEnabled: boolean;
  alarmMinutes: number;
  adoptLegacy: boolean;
  legacyDestination?: WritableCalendarDestination | null;
}

export interface CalendarExportPreview {
  userId: string;
  range: Required<Pick<CalendarSyncDateRange, 'startDate' | 'endDate'>>;
  draft: CalendarExportDraft;
  destination: WritableCalendarDestination | null;
  expectedManagedId: string | null;
  selectedCount: number;
  legacyAdoption: boolean;
  shifts: CalendarShiftForSync[];
  shiftCodes: CalendarShiftCodeForSync[];
}

const managedKey = (userId: string) => `${CALENDAR_MANAGED_ID_KEY_PREFIX}${userId}`;
const nameKey = (userId: string) => `${CALENDAR_NAME_KEY_PREFIX}${userId}`;
const colorKey = (userId: string) => `${CALENDAR_COLOR_KEY_PREFIX}${userId}`;
const calendarAlarmMinutesKey = (userId: string) => `${CALENDAR_ALARM_MINUTES_KEY_PREFIX}${userId}`;
let exportCommitInFlight = false;

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
  getExportDraft: (userId: string) => Promise<CalendarExportDraft>;
  prepareExport: (userId: string, draft: CalendarExportDraft, range?: CalendarSyncDateRange) => Promise<CalendarExportPreview>;
  commitExport: (preview: CalendarExportPreview) => Promise<CalendarSyncResult | null>;
  getWritableCalendars: () => Promise<WritableCalendarDestination[]>;
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

export function calendarTitleModeKey(userId: string): string {
  return `${CALENDAR_TITLE_MODE_KEY_PREFIX}${userId}`;
}

export async function getCalendarTitleMode(userId?: string): Promise<CalendarTitleMode> {
  if (!userId) return 'shift_first';
  try {
    const value = await AsyncStorage.getItem(calendarTitleModeKey(userId));
    return value === 'shift_only' || value === 'name_first' ? value : 'shift_first';
  } catch {
    return 'shift_first';
  }
}

function isOfflineReadOnly(): boolean {
  return useAuthStore.getState().isOfflineReadOnly === true;
}

async function resolveCalendarId(userId: string | undefined, currentId: string | null): Promise<string | null> {
  try {
    // A destination is account-owned state. Never borrow the in-memory ID
    // while resolving a specific user: on a shared device it may belong to
    // the previously signed-in account.
    const candidate = userId ? await AsyncStorage.getItem(destinationKey(userId)) : currentId;
    return candidate && await isWritableCalendar(candidate) ? candidate : null;
  } catch {
    // Permission may have been revoked or a provider account removed. Callers
    // treat null as disconnected instead of letting a native error escape.
    return null;
  }
}

export function formatExportSummary(preview: CalendarExportPreview): string {
  const { draft, destination, range, selectedCount } = preview;
  return [
    i18n.t('settings.exportDestination', { value: destination ? `${destination.title}${destination.sourceName ? ` · ${destination.sourceName}` : ''}` : i18n.t('settings.exportNewCalendar') }),
    i18n.t('settings.exportName', { value: draft.name }),
    i18n.t('settings.exportColor', { value: (() => { const colorName = ({ '#E5484D': 'red', '#F28C28': 'orange', '#F2C94C': 'yellow', '#43A66A': 'green', '#4A90E2': 'blue', '#9765C9': 'purple', '#9B7653': 'brown', '#4A9DAD': 'teal' } as Record<string, string>)[draft.color.toUpperCase()]; return colorName ? i18n.t(`settings.exportColorNames.${colorName}`) : draft.color; })() }),
    i18n.t('settings.exportMonth', { value: range.startDate.slice(0, 7) }),
    i18n.t('settings.exportFilter', { value: i18n.t(`settings.${draft.filter === 'work_days' ? 'calendarSyncWorkDays' : draft.filter === 'days_off' ? 'calendarSyncDaysOff' : 'calendarSyncAll'}`) }),
    i18n.t('settings.exportCount', { count: selectedCount }),
    i18n.t('settings.exportTitleMode', { value: i18n.t(`settings.calendarTitle.${draft.titleMode === 'shift_only' ? 'shiftOnly' : draft.titleMode === 'name_first' ? 'nameFirst' : 'shiftFirst'}`) }),
    i18n.t('settings.exportReminder', { value: draft.alarmsEnabled ? `${draft.alarmMinutes} min` : i18n.t('settings.calendarAlarmsDisabled') }),
    i18n.t('settings.exportRemovalNotice'),
    preview.legacyAdoption ? i18n.t('settings.exportLegacyAdoptNotice') : !preview.expectedManagedId && draft.legacyDestination ? i18n.t('settings.exportLegacyNewNotice') : '',
    preview.expectedManagedId && !preview.destination ? i18n.t('settings.exportMissingCalendarNotice') : '',
  ].join('\n');
}

function confirmPreview(preview: CalendarExportPreview): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(i18n.t('settings.exportConfirmTitle'), formatExportSummary(preview), [
      { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: i18n.t('settings.exportConfirm'), onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
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

  getExportDraft: async (userId) => {
    const [savedName, savedColor, savedFilter, savedTitle, savedAlarms, savedMinutes, fallbackMinutes, managedId, savedDestination] = await Promise.all([
      AsyncStorage.getItem(nameKey(userId)),
      AsyncStorage.getItem(colorKey(userId)),
      AsyncStorage.getItem(calendarSyncFilterKey(userId)),
      AsyncStorage.getItem(calendarTitleModeKey(userId)),
      AsyncStorage.getItem(calendarAlarmsKey(userId)),
      AsyncStorage.getItem(calendarAlarmMinutesKey(userId)),
      AsyncStorage.getItem(ALARM_MINUTES_KEY),
      AsyncStorage.getItem(managedKey(userId)),
      AsyncStorage.getItem(destinationKey(userId)),
    ]);
    const native = managedId ? await getCalendarDestination(managedId).catch(() => null) : null;
    const legacyDestination = !managedId && savedDestination ? await getCalendarDestination(savedDestination).catch(() => null) : null;
    const minutes = Number(savedMinutes || fallbackMinutes);
    return {
      name: native?.title || savedName || CALENDAR_NAME,
      color: native?.color || savedColor || CALENDAR_COLOR,
      filter: savedFilter === 'work_days' || savedFilter === 'days_off' ? savedFilter : 'all',
      titleMode: savedTitle === 'shift_only' || savedTitle === 'name_first' ? savedTitle : 'shift_first',
      alarmsEnabled: savedAlarms === 'true',
      alarmMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ALARM_MINUTES,
      adoptLegacy: legacyDestination?.title === CALENDAR_NAME,
      legacyDestination,
    };
  },

  prepareExport: async (userId, draft, range) => {
    if (isOfflineReadOnly() || useAuthStore.getState().user?.id !== userId) throw new Error('Calendar export requires an online account');
    const name = draft.name.trim();
    if (!name || name.length > 80) throw new Error('Calendar name must be 1–80 characters');
    if (!CALENDAR_COLORS.includes(draft.color as typeof CALENDAR_COLORS[number]) && draft.color !== CALENDAR_COLOR) {
      // An existing provider may have a custom color. It remains valid until edited.
      const saved = await get().getExportDraft(userId);
      if (saved.color.toLowerCase() !== draft.color.toLowerCase()) throw new Error('Unsupported calendar color');
    }
    const monthRange = getSingleMonthRange(range);
    const managedId = await AsyncStorage.getItem(managedKey(userId));
    const legacyId = !managedId && draft.adoptLegacy ? await AsyncStorage.getItem(destinationKey(userId)) : null;
    const candidate = managedId ? await getCalendarDestination(managedId) : legacyId ? await getCalendarDestination(legacyId) : null;
    if (managedId && !candidate && !await hasCalendarPermissions()) throw new Error('Calendar permission denied');
    const codeStore = useShiftCodeStore.getState();
    if (codeStore.shiftCodes.length === 0) await codeStore.fetchShiftCodes(userId);
    const { data, error } = await supabase.rpc('get_my_schedule_shifts', {
      p_start_date: monthRange.startDate,
      p_end_date: monthRange.endDate,
    });
    if (error) throw error;
    const shiftCodes = useShiftCodeStore.getState().shiftCodes;
    const shifts = ((data || []) as CalendarShiftForSync[]).filter((shift) => matchesCalendarSyncFilter(
      shift, draft.filter, shiftCodes.find((code) => code.code === shift.shift_code),
    ));
    return { userId, range: monthRange, draft: { ...draft, name }, destination: candidate, expectedManagedId: managedId, legacyAdoption: !!legacyId, selectedCount: shifts.length, shifts, shiftCodes };
  },

  commitExport: async (preview) => {
    const { userId, draft, range } = preview;
    if (exportCommitInFlight || isOfflineReadOnly() || useAuthStore.getState().user?.id !== userId) return null;
    const authUser = useAuthStore.getState().user;
    const assertCurrent = () => {
      if (isOfflineReadOnly() || useAuthStore.getState().user !== authUser || useAuthStore.getState().user?.id !== userId) {
        throw new Error('Account changed during calendar export');
      }
    };
    exportCommitInFlight = true;
    set({ loading: true, error: null });
    try {
      assertCurrent();
      const granted = await requestCalendarPermissions();
      assertCurrent();
      if (!granted) throw new Error('Calendar permission denied');
      const managedId = await AsyncStorage.getItem(managedKey(userId));
      assertCurrent();
      if (managedId !== preview.expectedManagedId) {
        throw new Error('Calendar destination changed. Review the export again.');
      }
      if (preview.legacyAdoption && await AsyncStorage.getItem(destinationKey(userId)) !== preview.destination?.id) {
        throw new Error('Previous calendar changed. Review the export again.');
      }
      let calendarId: string;
      if (preview.destination) {
        const current = await getCalendarDestination(preview.destination.id);
        assertCurrent();
        if (!current) throw new Error('Calendar is no longer writable');
        if (current.title !== preview.destination.title || current.color !== preview.destination.color) {
          throw new Error('Calendar destination changed. Review the export again.');
        }
        // Android's provider owns calendar colors; only iOS can change them.
        const requestedColor = Platform.OS === 'android' ? current.color || draft.color : draft.color;
        await updateIShiftCalendar(current.id, draft.name, requestedColor);
        assertCurrent();
        calendarId = current.id;
      } else {
        assertCurrent();
        const createdId = await getOrCreateShiftSnapCalendar(draft.name, draft.color);
        if (!createdId) throw new Error(CALENDAR_ACCOUNT_READONLY);
        calendarId = createdId;
        // Keep a returned native ID even if readback fails, so retry can
        // repair this calendar instead of creating a duplicate.
        await AsyncStorage.setItem(managedKey(userId), calendarId);
        const readback = await getCalendarDestination(calendarId);
        assertCurrent();
        if (!readback || readback.title !== draft.name || (Platform.OS === 'ios' && readback.color?.toLowerCase() !== draft.color.toLowerCase())) {
          throw new Error('Calendar name or color was not applied by the device');
        }
      }
      assertCurrent();
      await AsyncStorage.multiSet([
        [managedKey(userId), calendarId], [destinationKey(userId), calendarId], [connectedKey(userId), 'true'],
        [nameKey(userId), draft.name], [colorKey(userId), draft.color],
        [calendarSyncFilterKey(userId), draft.filter], [calendarTitleModeKey(userId), draft.titleMode],
        [calendarAlarmsKey(userId), draft.alarmsEnabled ? 'true' : 'false'],
        [calendarAlarmMinutesKey(userId), String(draft.alarmMinutes)],
      ]);
      assertCurrent();
      set({ activeUserId: userId, isConnected: true, calendarId });
      const result = await reconcileShiftsToCalendar(preview.shifts, preview.shiftCodes, calendarId, {
        ...range, userId, titleMode: draft.titleMode,
        alarmMinutes: draft.alarmsEnabled ? draft.alarmMinutes : null,
      });
      assertCurrent();
      const ownedShiftIds = new Set(preview.shifts.filter((shift) => shift.user_id === userId).map((shift) => shift.id));
      await persistEventIds(new Map([...result.eventIdsByShiftId].filter(([id]) => ownedShiftIds.has(id))));
      return result;
    } catch (error) {
      if (useAuthStore.getState().user === authUser) set({ error: error instanceof Error ? error.message : 'Calendar export failed' });
      return null;
    } finally {
      exportCommitInFlight = false;
      set({ loading: false });
    }
  },

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
    if (isOfflineReadOnly() || !isConnected || activeUserId !== userId) return null;
    const calendarId = await resolveCalendarId(userId, get().calendarId);
    if (!calendarId) return null;
    if (calendarId !== get().calendarId) {
      await AsyncStorage.setItem(destinationKey(userId), calendarId);
      set({ calendarId, isConnected: true });
    }
    if (isOfflineReadOnly() || get().activeUserId !== userId) return null;

    set({ loading: true, error: null });
    try {
      if (isOfflineReadOnly() || get().activeUserId !== userId) {
        set({ loading: false });
        return null;
      }
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
    const result = await get().syncUserShifts(shift.user_id, {
      userId: shift.user_id, startDate: shift.date,
    });
    return result?.eventIdsByShiftId.get(shift.id) || null;
  },

  syncShifts: async (shifts, shiftCodes, range) => {
    const syncUserId = range?.userId || shifts[0]?.user_id;
    if (!syncUserId) return null;
    // A partial list cannot safely reconcile a month: it would delete the
    // other managed events. Fetch the authoritative month first.
    return get().syncUserShifts(syncUserId, { ...range, startDate: range?.startDate || shifts[0]?.date });
  },

  syncUserShifts: async (userId, range) => {
    const { isConnected, activeUserId } = get();
    if (isOfflineReadOnly() || !isConnected || activeUserId !== userId) return null;
    try {
      const draft = await get().getExportDraft(userId);
      const preview = await get().prepareExport(userId, draft, range);
      if (!preview.destination) {
        set({ error: 'IShift calendar must be connected in Settings before syncing' });
        Alert.alert(i18n.t('common.error'), i18n.t('settings.exportDestinationChanged'));
        return null;
      }
      if (!await confirmPreview(preview)) return null;
      const result = await get().commitExport(preview);
      if (!result) {
        Alert.alert(i18n.t('common.error'), i18n.t('settings.exportFailed'));
      } else if (result.failed > 0) {
        Alert.alert(i18n.t('common.error'), i18n.t('settings.exportPartial', { count: result.failed }));
      } else {
        Alert.alert(i18n.t('settings.exportCompleteTitle'), i18n.t('settings.exportComplete', { count: preview.selectedCount }));
      }
      return result;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Calendar export failed' });
      Alert.alert(i18n.t('common.error'), i18n.t('settings.exportFailed'));
      return null;
    }
  },
}));
