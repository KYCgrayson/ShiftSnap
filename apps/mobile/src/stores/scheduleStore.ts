import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { OCRResult } from '@shiftsnap/shared';

interface ScheduleItem {
  id: string;
  owner_id: string;
  person_id: string | null;
  image_url: string;
  year_month: string;
  raw_ocr_result: OCRResult | null;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
}

interface ScheduleState {
  schedules: ScheduleItem[];
  currentSchedule: ScheduleItem | null;
  loading: boolean;
  error: string | null;

  fetchSchedules: (userId: string) => Promise<void>;
  createScheduleFromOCR: (
    userId: string,
    imageUrl: string,
    yearMonth: string,
    ocrResult: OCRResult
  ) => Promise<string>;
  updateScheduleStatus: (scheduleId: string, status: 'draft' | 'published' | 'archived') => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedules: [],
  currentSchedule: null,
  loading: false,
  error: null,

  fetchSchedules: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ schedules: data || [], loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch schedules';
      set({ loading: false, error: message });
    }
  },

  createScheduleFromOCR: async (
    userId: string,
    imageUrl: string,
    yearMonth: string,
    ocrResult: OCRResult
  ) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('schedules')
        .insert({
          owner_id: userId,
          image_url: imageUrl,
          year_month: yearMonth,
          raw_ocr_result: ocrResult,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        schedules: [data, ...state.schedules],
        currentSchedule: data,
        loading: false,
      }));

      return data.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create schedule';
      set({ loading: false, error: message });
      throw error;
    }
  },

  updateScheduleStatus: async (scheduleId: string, status: 'draft' | 'published' | 'archived') => {
    try {
      const { error } = await supabase
        .from('schedules')
        .update({ status })
        .eq('id', scheduleId);

      if (error) throw error;

      set((state) => ({
        schedules: state.schedules.map((s) =>
          s.id === scheduleId ? { ...s, status } : s
        ),
        currentSchedule:
          state.currentSchedule?.id === scheduleId
            ? { ...state.currentSchedule, status }
            : state.currentSchedule,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update schedule status';
      set({ error: message });
      throw error;
    }
  },
}));
