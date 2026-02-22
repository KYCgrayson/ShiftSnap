import { create } from 'zustand';
import { supabase } from '../services/supabase';

interface ShiftCodeItem {
  id: string;
  code: string;
  meaning: string;
  start_time: string | null;
  end_time: string | null;
  is_day_off: boolean;
  is_confirmed: boolean;
}

interface ShiftCodeState {
  shiftCodes: ShiftCodeItem[];
  loading: boolean;
  error: string | null;

  fetchShiftCodes: (userId: string) => Promise<void>;
  saveShiftCode: (
    userId: string,
    code: string,
    meaning: string,
    startTime: string | null,
    endTime: string | null,
    isDayOff: boolean
  ) => Promise<void>;
  deleteShiftCode: (id: string) => Promise<void>;
  getCodeInfo: (code: string) => ShiftCodeItem | undefined;
}

export const useShiftCodeStore = create<ShiftCodeState>((set, get) => ({
  shiftCodes: [],
  loading: false,
  error: null,

  fetchShiftCodes: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('shift_codes')
        .select('*')
        .eq('user_id', userId)
        .order('code');

      if (error) throw error;

      set({
        shiftCodes: data?.map((item) => ({
          id: item.id,
          code: item.code,
          meaning: item.meaning,
          start_time: item.start_time,
          end_time: item.end_time,
          is_day_off: item.is_day_off,
          is_confirmed: item.is_confirmed,
        })) || [],
        loading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch shift codes';
      set({ loading: false, error: message });
    }
  },

  saveShiftCode: async (
    userId: string,
    code: string,
    meaning: string,
    startTime: string | null,
    endTime: string | null,
    isDayOff: boolean
  ) => {
    try {
      const { error } = await supabase.from('shift_codes').upsert({
        user_id: userId,
        code,
        meaning,
        start_time: startTime,
        end_time: endTime,
        is_day_off: isDayOff,
        is_confirmed: true,
      });

      if (error) throw error;

      // Refresh the list
      await get().fetchShiftCodes(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save shift code';
      set({ error: message });
      throw error;
    }
  },

  deleteShiftCode: async (id: string) => {
    try {
      const { error } = await supabase.from('shift_codes').delete().eq('id', id);
      if (error) throw error;

      set((state) => ({
        shiftCodes: state.shiftCodes.filter((sc) => sc.id !== id),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete shift code';
      set({ error: message });
      throw error;
    }
  },

  getCodeInfo: (code: string) => {
    return get().shiftCodes.find((sc) => sc.code === code);
  },
}));
