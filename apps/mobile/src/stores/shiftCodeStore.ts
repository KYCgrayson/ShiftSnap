import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { getIsGuest } from './authStore';
import { getGuestShiftCodes } from '../data/guestDemoData';
import { useShiftStore } from './shiftStore';
import { useGroupStore } from './groupStore';

interface ShiftCodeItem {
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
  reset: () => void;
}

export const useShiftCodeStore = create<ShiftCodeState>((set, get) => ({
  shiftCodes: [],
  loading: false,
  error: null,

  fetchShiftCodes: async (userId: string) => {
    if (getIsGuest()) {
      // If codes are already loaded (e.g. user corrected times in review), don't overwrite
      if (get().shiftCodes.length > 0) return;
      set({ shiftCodes: [...getGuestShiftCodes()], loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const currentGroup = useGroupStore.getState().currentGroup;

      // Fetch user's own codes + group-shared codes
      let query = supabase
        .from('shift_codes')
        .select('*')
        .order('code');

      if (currentGroup) {
        query = query.or(`user_id.eq.${userId},and(group_id.eq.${currentGroup.id},is_group_shared.eq.true)`);
      } else {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
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
          group_id: item.group_id,
          is_group_shared: item.is_group_shared,
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
    if (getIsGuest()) {
      // Local-only write for guests
      const existing = get().shiftCodes.find((sc) => sc.code === code);
      if (existing) {
        set((state) => ({
          shiftCodes: state.shiftCodes.map((sc) =>
            sc.code === code
              ? { ...sc, meaning, start_time: startTime, end_time: endTime, is_day_off: isDayOff, is_confirmed: true }
              : sc
          ),
        }));
      } else {
        const newCode: ShiftCodeItem = {
          id: `g-sc-local-${Date.now()}`,
          code,
          meaning,
          start_time: startTime,
          end_time: endTime,
          is_day_off: isDayOff,
          is_confirmed: true,
          group_id: 'guest-group',
          is_group_shared: true,
        };
        set((state) => ({ shiftCodes: [...state.shiftCodes, newCode] }));
      }
      // Cascade time changes to existing guest shifts
      const shiftState = useShiftStore.getState();
      const applyUpdate = (s: any) =>
        s.shift_code === code ? { ...s, start_time: startTime, end_time: endTime, is_day_off: isDayOff } : s;
      useShiftStore.setState({
        monthShifts: shiftState.monthShifts.map(applyUpdate),
        allOcrShifts: shiftState.allOcrShifts.map(applyUpdate),
      });
      return;
    }
    try {
      const currentGroup = useGroupStore.getState().currentGroup;

      // Check DB directly for existing code (not relying on in-memory state)
      const { data: existingRows } = await supabase
        .from('shift_codes')
        .select('id')
        .eq('user_id', userId)
        .eq('code', code)
        .limit(1);

      const existingId = existingRows?.[0]?.id;

      if (existingId) {
        const { error } = await supabase
          .from('shift_codes')
          .update({
            meaning,
            start_time: startTime,
            end_time: endTime,
            is_day_off: isDayOff,
            is_confirmed: true,
            group_id: currentGroup?.id || null,
            is_group_shared: true,
          })
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shift_codes').insert({
          user_id: userId,
          group_id: currentGroup?.id || null,
          code,
          meaning,
          start_time: startTime,
          end_time: endTime,
          is_day_off: isDayOff,
          is_confirmed: true,
          is_group_shared: true,
        });
        if (error) throw error;
      }

      // Cascade time changes to existing shifts (non-critical)
      try {
        await supabase
          .from('shifts')
          .update({ start_time: startTime, end_time: endTime, is_day_off: isDayOff })
          .eq('user_id', userId)
          .eq('shift_code', code);
        // Update in-memory shifts
        const shiftState = useShiftStore.getState();
        const updatedMonthShifts = shiftState.monthShifts.map((s) =>
          s.shift_code === code ? { ...s, start_time: startTime, end_time: endTime, is_day_off: isDayOff } : s
        );
        useShiftStore.setState({ monthShifts: updatedMonthShifts });
      } catch (cascadeError) {
        console.error('Non-critical: failed to cascade shift code times to shifts:', cascadeError);
      }

      // Refresh the list
      await get().fetchShiftCodes(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save shift code';
      set({ error: message });
      throw error;
    }
  },

  deleteShiftCode: async (id: string) => {
    if (getIsGuest()) {
      set((state) => ({
        shiftCodes: state.shiftCodes.filter((sc) => sc.id !== id),
      }));
      return;
    }
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

  reset: () => {
    set({ shiftCodes: [], loading: false, error: null });
  },
}));
