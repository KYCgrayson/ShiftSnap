import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  requestCalendarPermissions,
  getOrCreateShiftSnapCalendar,
  syncShiftToCalendar,
  removeShiftFromCalendar,
  CALENDAR_ACCOUNT_READONLY,
} from '../services/calendarSync';

const CALENDAR_CONNECTED_KEY = 'shiftsnap_calendar_connected';
const CALENDAR_ID_KEY = 'shiftsnap_calendar_id';

interface CalendarState {
  isConnected: boolean;
  calendarId: string | null;
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  connectCalendar: () => Promise<boolean>;
  disconnectCalendar: () => Promise<void>;
  syncShift: (
    shift: { id: string; date: string; shift_code: string; start_time: string | null; is_day_off: boolean; calendar_event_id: string | null },
    codeInfo: { meaning: string; start_time: string | null; end_time: string | null } | undefined
  ) => Promise<string | null>;
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

  syncShift: async (shift, codeInfo) => {
    const { isConnected, calendarId } = get();
    if (!isConnected || !calendarId) return null;

    try {
      const eventId = await syncShiftToCalendar(shift, codeInfo, calendarId);
      return eventId;
    } catch (error) {
      console.error('Error syncing shift to calendar:', error);
      return null;
    }
  },
}));
