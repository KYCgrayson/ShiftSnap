import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { OCRResult } from '@shiftsnap/shared';
import { formatDateISO } from '@shiftsnap/shared';

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
  calendar_event_id: string | null;
  synced_at: string | null;
}

interface ShiftState {
  todayShift: ShiftItem | null;
  upcomingShifts: ShiftItem[];
  monthShifts: ShiftItem[];
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
    yearMonth: string
  ) => Promise<void>;
  updateShiftCalendarSync: (shiftId: string, calendarEventId: string) => Promise<void>;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  todayShift: null,
  upcomingShifts: [],
  monthShifts: [],
  loading: false,
  error: null,

  fetchTodayShift: async (userId: string) => {
    try {
      const today = formatDateISO(new Date());
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();

      if (error) throw error;
      set({ todayShift: data });
    } catch (error) {
      console.error('Error fetching today shift:', error);
    }
  },

  fetchUpcomingShifts: async (userId: string, limit: number = 5) => {
    try {
      const today = formatDateISO(new Date());
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
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
    yearMonth: string
  ) => {
    set({ loading: true, error: null });
    try {
      const [year, month] = yearMonth.split('-').map(Number);
      const shifts: Array<Record<string, unknown>> = [];

      for (const row of ocrResult.rows) {
        for (const ocrShift of row.shifts) {
          const codeInfo = shiftCodes.find((sc) => sc.code === ocrShift.code);
          const date = `${yearMonth}-${String(ocrShift.date).padStart(2, '0')}`;

          // Validate date
          const dayDate = new Date(year, month - 1, ocrShift.date);
          if (dayDate.getMonth() !== month - 1) continue; // Invalid day for this month

          shifts.push({
            schedule_id: scheduleId,
            user_id: userId,
            date,
            shift_code: ocrShift.code,
            start_time: codeInfo?.start_time || null,
            end_time: codeInfo?.end_time || null,
            is_day_off: codeInfo?.is_day_off ?? false,
            source: 'self_scan',
            comparison_status: 'pending',
          });
        }
      }

      if (shifts.length > 0) {
        const { error } = await supabase.from('shifts').insert(shifts);
        if (error) throw error;
      }

      set({ loading: false });

      // Refresh data
      await get().fetchTodayShift(userId);
      await get().fetchUpcomingShifts(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create shifts';
      set({ loading: false, error: message });
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
}));
