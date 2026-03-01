import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import type { OCRResult } from '@shiftsnap/shared';
import { formatDateISO } from '@shiftsnap/shared';
import { getIsGuest } from './authStore';
import { getGuestTodayShift, getGuestUpcomingShifts, generateGuestShiftsForMonth } from '../data/guestDemoData';

const GUEST_SHIFTS_KEY = 'shiftsnap:guest-shifts';

interface ShiftItem {
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

interface ShiftState {
  todayShift: ShiftItem | null;
  upcomingShifts: ShiftItem[];
  monthShifts: ShiftItem[];
  allOcrShifts: ShiftItem[];
  hasOcrData: boolean;
  loading: boolean;
  error: string | null;

  fetchTodayShift: (userId: string) => Promise<void>;
  fetchUpcomingShifts: (userId: string, limit?: number) => Promise<void>;
  fetchShiftsForMonth: (userId: string, yearMonth: string) => Promise<void>;
  createShiftsFromOCR: (
    scheduleId: string,
    userId: string,
    ocrResult: OCRResult,
    shiftCodes: Array<{ code: string; start_time: string | null; end_time: string | null; is_day_off: boolean }>,
    yearMonth: string,
    selectedPersonIndex: number,
    personMap?: Map<number, string>
  ) => Promise<void>;
  updateShift: (shiftId: string, updates: Partial<Pick<ShiftItem, 'start_time' | 'end_time' | 'is_day_off' | 'shift_code'>>) => Promise<void>;
  updateShiftCalendarSync: (shiftId: string, calendarEventId: string) => Promise<void>;
  reset: () => void;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  todayShift: null,
  upcomingShifts: [],
  monthShifts: [],
  allOcrShifts: [],
  hasOcrData: false,
  loading: false,
  error: null,

  fetchTodayShift: async (userId: string) => {
    if (getIsGuest()) {
      if (get().hasOcrData) {
        const today = formatDateISO(new Date());
        const todayShift = get().allOcrShifts.find((s) => s.date === today && s.source === 'self_scan') ?? null;
        set({ todayShift });
      } else {
        // Try loading from AsyncStorage
        try {
          const stored = await AsyncStorage.getItem(GUEST_SHIFTS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as ShiftItem[];
            if (parsed.length > 0) {
              const today = formatDateISO(new Date());
              const todayShift = parsed.find((s) => s.date === today && s.source === 'self_scan') ?? null;
              set({ allOcrShifts: parsed, hasOcrData: true, todayShift });
              return;
            }
          }
        } catch (e) {
          console.warn('Failed to load guest shifts:', e);
        }
        set({ todayShift: getGuestTodayShift() });
      }
      return;
    }
    try {
      const today = formatDateISO(new Date());
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .is('person_id', null)
        .eq('source', 'self_scan')
        .maybeSingle();

      if (error) throw error;
      set({ todayShift: data });
    } catch (error) {
      console.error('Error fetching today shift:', error);
    }
  },

  fetchUpcomingShifts: async (userId: string, limit: number = 5) => {
    if (getIsGuest()) {
      if (get().hasOcrData) {
        const today = formatDateISO(new Date());
        const upcoming = get().allOcrShifts
          .filter((s) => s.date >= today && s.source === 'self_scan')
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, limit);
        set({ upcomingShifts: upcoming });
      } else {
        set({ upcomingShifts: getGuestUpcomingShifts(limit) });
      }
      return;
    }
    try {
      const today = formatDateISO(new Date());
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .is('person_id', null)
        .eq('source', 'self_scan')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(limit);

      if (error) throw error;
      set({ upcomingShifts: data || [] });
    } catch (error) {
      console.error('Error fetching upcoming shifts:', error);
    }
  },

  fetchShiftsForMonth: async (userId: string, yearMonth: string) => {
    if (getIsGuest()) {
      // If OCR data already in memory, use it
      if (get().hasOcrData) {
        const filtered = get().allOcrShifts.filter((s) => s.date.startsWith(yearMonth));
        set({ monthShifts: filtered, loading: false });
        return;
      }
      // Try loading persisted OCR shifts from AsyncStorage
      try {
        const stored = await AsyncStorage.getItem(GUEST_SHIFTS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ShiftItem[];
          if (parsed.length > 0) {
            const filtered = parsed.filter((s) => s.date.startsWith(yearMonth));
            set({ allOcrShifts: parsed, monthShifts: filtered, hasOcrData: true, loading: false });
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load guest shifts:', e);
      }
      // Fallback to demo data
      set({ monthShifts: generateGuestShiftsForMonth(yearMonth), loading: false });
      return;
    }
    set({ loading: true });
    try {
      const [year, month] = yearMonth.split('-').map(Number);
      const startDate = `${yearMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) throw error;
      set({ monthShifts: data || [], loading: false });
    } catch (error) {
      console.error('Error fetching month shifts:', error);
      set({ loading: false });
    }
  },

  createShiftsFromOCR: async (
    scheduleId: string,
    userId: string,
    ocrResult: OCRResult,
    shiftCodes: Array<{ code: string; start_time: string | null; end_time: string | null; is_day_off: boolean }>,
    yearMonth: string,
    selectedPersonIndex: number,
    personMap?: Map<number, string>
  ) => {
    set({ loading: true, error: null });

    const [year, month] = yearMonth.split('-').map(Number);
    const newShifts: ShiftItem[] = [];

    ocrResult.rows.forEach((row, rowIndex) => {
      const isSelf = rowIndex === selectedPersonIndex;
      const personName = row.name || `Person ${rowIndex + 1}`;

      // If personMap is provided and this row is not self and not in the map, skip it
      if (personMap && !isSelf && !personMap.has(rowIndex)) return;

      for (const ocrShift of row.shifts) {
        const codeInfo = shiftCodes.find((sc) => sc.code === ocrShift.code);
        const date = `${yearMonth}-${String(ocrShift.date).padStart(2, '0')}`;

        // Validate date
        const dayDate = new Date(year, month - 1, ocrShift.date);
        if (dayDate.getMonth() !== month - 1) continue; // Invalid day for this month

        newShifts.push({
          id: getIsGuest() ? `g-shift-ocr-${Date.now()}-${date}-${rowIndex}` : '',
          schedule_id: scheduleId,
          user_id: userId,
          person_id: isSelf ? null : (personMap?.get(rowIndex) ?? null),
          date,
          shift_code: ocrShift.code,
          start_time: codeInfo?.start_time || null,
          end_time: codeInfo?.end_time || null,
          is_day_off: codeInfo?.is_day_off ?? false,
          source: isSelf ? 'self_scan' : 'reference_scan',
          name_on_schedule: personName,
          comparison_status: 'pending',
          calendar_event_id: null,
          synced_at: null,
        });
      }
    });

    if (getIsGuest()) {
      // Store in-memory for guests — append to allOcrShifts, derive monthShifts
      const today = formatDateISO(new Date());

      // Replace shifts for this yearMonth in allOcrShifts (clean slate per month)
      const otherMonthShifts = get().allOcrShifts.filter((s) => !s.date.startsWith(yearMonth));
      const updatedAll = [...otherMonthShifts, ...newShifts];

      const monthFiltered = updatedAll.filter((s) => s.date.startsWith(yearMonth));
      const allSelfShifts = updatedAll.filter((s) => s.source === 'self_scan');
      const todayShift = allSelfShifts.find((s) => s.date === today) ?? get().todayShift;
      const upcoming = allSelfShifts
        .filter((s) => s.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5);

      set({
        allOcrShifts: updatedAll,
        monthShifts: monthFiltered,
        todayShift,
        upcomingShifts: upcoming.length > 0 ? upcoming : get().upcomingShifts,
        hasOcrData: true,
        loading: false,
      });
      // Persist to AsyncStorage so shifts survive app restart
      AsyncStorage.setItem(GUEST_SHIFTS_KEY, JSON.stringify(updatedAll)).catch(
        (e) => console.warn('Failed to persist guest shifts:', e)
      );
      return;
    }

    try {
      // Delete ALL existing shifts for this user in the target month (clean slate on re-scan)
      const [yr, mo] = yearMonth.split('-').map(Number);
      const startDate = `${yearMonth}-01`;
      const lastDay = new Date(yr, mo, 0).getDate();
      const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
      const { error: deleteError } = await supabase
        .from('shifts')
        .delete()
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate);
      if (deleteError) throw deleteError;

      if (newShifts.length > 0) {
        const rows = newShifts.map((s) => ({
          schedule_id: s.schedule_id,
          user_id: s.user_id,
          person_id: s.person_id,
          date: s.date,
          shift_code: s.shift_code,
          start_time: s.start_time,
          end_time: s.end_time,
          is_day_off: s.is_day_off,
          source: s.source,
          name_on_schedule: s.name_on_schedule,
          comparison_status: 'pending',
        }));
        const { error } = await supabase.from('shifts').insert(rows);
        if (error) throw error;
      }

      // Auto-match with other users' reference scans
      const selfPersonName = ocrResult.rows[selectedPersonIndex]?.name;
      if (selfPersonName) {
        try {
          await supabase.rpc('auto_match_shifts', {
            p_user_id: userId,
            p_year_month: yearMonth,
            p_person_name: selfPersonName,
          });
        } catch {
          // Non-critical: matching failure shouldn't block save
        }
      }

      set({ loading: false });

      // Refresh data — including monthShifts so calendar sync reads fresh data
      await get().fetchShiftsForMonth(userId, yearMonth);
      await get().fetchTodayShift(userId);
      await get().fetchUpcomingShifts(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create shifts';
      set({ loading: false, error: message });
      throw error;
    }
  },

  updateShift: async (shiftId: string, updates: Partial<Pick<ShiftItem, 'start_time' | 'end_time' | 'is_day_off' | 'shift_code'>>) => {
    if (getIsGuest()) {
      const applyUpdates = (shifts: ShiftItem[]) =>
        shifts.map((s) => (s.id === shiftId ? { ...s, ...updates } : s));
      const updatedAll = applyUpdates(get().allOcrShifts);
      set((state) => ({
        allOcrShifts: updatedAll,
        monthShifts: applyUpdates(state.monthShifts),
        todayShift: state.todayShift?.id === shiftId ? { ...state.todayShift, ...updates } : state.todayShift,
        upcomingShifts: applyUpdates(state.upcomingShifts),
      }));
      AsyncStorage.setItem(GUEST_SHIFTS_KEY, JSON.stringify(updatedAll)).catch(
        (e) => console.warn('Failed to persist guest shifts:', e)
      );
      return;
    }
    try {
      const { error } = await supabase
        .from('shifts')
        .update(updates)
        .eq('id', shiftId);
      if (error) throw error;

      // Update in-memory state immediately
      const applyUpdates = (shifts: ShiftItem[]) =>
        shifts.map((s) => (s.id === shiftId ? { ...s, ...updates } : s));
      set((state) => ({
        monthShifts: applyUpdates(state.monthShifts),
        todayShift: state.todayShift?.id === shiftId ? { ...state.todayShift, ...updates } : state.todayShift,
        upcomingShifts: applyUpdates(state.upcomingShifts),
      }));
    } catch (error) {
      console.error('Error updating shift:', error);
      throw error;
    }
  },

  updateShiftCalendarSync: async (shiftId: string, calendarEventId: string) => {
    try {
      const { error } = await supabase
        .from('shifts')
        .update({
          calendar_event_id: calendarEventId,
          synced_at: new Date().toISOString(),
        })
        .eq('id', shiftId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating shift calendar sync:', error);
    }
  },

  reset: () => {
    set({ todayShift: null, upcomingShifts: [], monthShifts: [], allOcrShifts: [], hasOcrData: false, loading: false, error: null });
    AsyncStorage.removeItem(GUEST_SHIFTS_KEY).catch(() => {});
  },
}));
