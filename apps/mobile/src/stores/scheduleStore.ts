import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import type { OCRResult } from '@shiftsnap/shared';
import { getIsGuest } from './authStore';
import { getGuestSchedules } from '../data/guestDemoData';
import { useGroupStore } from './groupStore';
import { buildScheduleImageStoragePath, getShiftImageExtension, getShiftImageStoragePath } from '../services/shiftImages';

const GUEST_SCHEDULES_KEY = 'shiftsnap:guest-schedules';

interface ScheduleItem {
  id: string;
  owner_id: string;
  person_id: string | null;
  group_id: string | null;
  image_url: string;
  image_status: 'pending' | 'uploaded' | 'failed' | 'missing' | 'unverified';
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
    ocrResult: OCRResult,
    imageStatus?: ScheduleItem['image_status'],
  ) => Promise<string>;
  updateScheduleImage: (
    scheduleId: string,
    imageUrl: string,
    imageStatus: ScheduleItem['image_status'],
  ) => Promise<void>;
  updateScheduleStatus: (scheduleId: string, status: 'draft' | 'published' | 'archived') => Promise<void>;
  updateScheduleYearMonth: (scheduleId: string, yearMonth: string) => Promise<void>;
  getUnsharedCount: (userId: string, groupId: string) => Promise<number>;
  shareSchedulesWithGroup: (userId: string, groupId: string) => Promise<number>;
  reset: () => void;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedules: [],
  currentSchedule: null,
  loading: false,
  error: null,

  fetchSchedules: async (userId: string) => {
    if (getIsGuest()) {
      // If user already has schedules in state (e.g. from scanning), don't overwrite
      if (get().schedules.length > 0) return;
      // Load persisted guest schedules from AsyncStorage
      try {
        const stored = await AsyncStorage.getItem(GUEST_SCHEDULES_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ScheduleItem[];
          if (parsed.length > 0) {
            set({ schedules: parsed, loading: false });
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load guest schedules from storage:', e);
      }
      // Fallback to demo data
      set({ schedules: getGuestSchedules() as any, loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const currentGroup = useGroupStore.getState().currentGroup;
      let query = supabase
        .from('schedules')
        .select('*');

      if (currentGroup && currentGroup.id !== 'guest-group') {
        query = query.or(`owner_id.eq.${userId},group_id.eq.${currentGroup.id}`);
      } else {
        query = query.eq('owner_id', userId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

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
    ocrResult: OCRResult,
    imageStatus: ScheduleItem['image_status'] = 'pending',
  ) => {
    if (getIsGuest()) {
      const localSchedule: ScheduleItem = {
        id: `g-schedule-${Date.now()}`,
        owner_id: userId,
        person_id: null,
        group_id: 'guest-group',
        image_url: imageUrl,
        image_status: imageStatus,
        year_month: yearMonth,
        raw_ocr_result: ocrResult,
        status: 'draft',
        created_at: new Date().toISOString(),
      };
      const updatedSchedules = [localSchedule, ...get().schedules.filter(s => s.id !== localSchedule.id)];
      set({
        schedules: updatedSchedules,
        currentSchedule: localSchedule,
        loading: false,
      });
      // Persist to AsyncStorage (non-blocking)
      AsyncStorage.setItem(GUEST_SCHEDULES_KEY, JSON.stringify(updatedSchedules)).catch(
        (e) => console.warn('Failed to persist guest schedules:', e)
      );
      return localSchedule.id;
    }
    set({ loading: true, error: null });
    try {
      const currentGroup = useGroupStore.getState().currentGroup;
      const { data, error } = await supabase
        .from('schedules')
        .insert({
          owner_id: userId,
          group_id: currentGroup?.id || null,
          image_url: imageUrl,
          image_status: imageStatus,
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

  updateScheduleImage: async (scheduleId, imageUrl, imageStatus) => {
    if (getIsGuest()) {
      const schedules = get().schedules.map((schedule) =>
        schedule.id === scheduleId
          ? { ...schedule, image_url: imageUrl, image_status: imageStatus }
          : schedule,
      );
      set({
        schedules,
        currentSchedule: get().currentSchedule?.id === scheduleId
          ? { ...get().currentSchedule!, image_url: imageUrl, image_status: imageStatus }
          : get().currentSchedule,
      });
      await AsyncStorage.setItem(GUEST_SCHEDULES_KEY, JSON.stringify(schedules));
      return;
    }

    const { error } = await supabase
      .from('schedules')
      .update({ image_url: imageUrl, image_status: imageStatus })
      .eq('id', scheduleId);
    if (error) throw error;

    set((state) => ({
      schedules: state.schedules.map((schedule) =>
        schedule.id === scheduleId
          ? { ...schedule, image_url: imageUrl, image_status: imageStatus }
          : schedule,
      ),
      currentSchedule: state.currentSchedule?.id === scheduleId
        ? { ...state.currentSchedule, image_url: imageUrl, image_status: imageStatus }
        : state.currentSchedule,
    }));
  },

  updateScheduleStatus: async (scheduleId: string, status: 'draft' | 'published' | 'archived') => {
    if (getIsGuest()) {
      const updatedSchedules = get().schedules.map((s) =>
        s.id === scheduleId ? { ...s, status } : s
      );
      set({
        schedules: updatedSchedules,
        currentSchedule:
          get().currentSchedule?.id === scheduleId
            ? { ...get().currentSchedule!, status }
            : get().currentSchedule,
      });
      AsyncStorage.setItem(GUEST_SCHEDULES_KEY, JSON.stringify(updatedSchedules)).catch(
        (e) => console.warn('Failed to persist guest schedules:', e)
      );
      return;
    }
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

  updateScheduleYearMonth: async (scheduleId: string, yearMonth: string) => {
    if (getIsGuest()) {
      const updatedSchedules = get().schedules.map((s) =>
        s.id === scheduleId ? { ...s, year_month: yearMonth } : s
      );
      set({
        schedules: updatedSchedules,
        currentSchedule:
          get().currentSchedule?.id === scheduleId
            ? { ...get().currentSchedule!, year_month: yearMonth }
            : get().currentSchedule,
      });
      AsyncStorage.setItem(GUEST_SCHEDULES_KEY, JSON.stringify(updatedSchedules)).catch(
        (e) => console.warn('Failed to persist guest schedules:', e)
      );
      return;
    }
    try {
      const existing = get().schedules.find((schedule) => schedule.id === scheduleId)
        || (await supabase.from('schedules')
          .select('id, owner_id, group_id, image_url, image_status')
          .eq('id', scheduleId)
          .single()).data;
      let imageUrl = existing?.image_url;
      let imageStatus = existing?.image_status;
      const oldPath = imageUrl ? getShiftImageStoragePath(imageUrl) : null;
      let movedFromPath: string | null = null;
      let movedToPath: string | null = null;

      // New images use their persisted schedule ID, so moving the month keeps
      // the object namespace truthful when a reviewer corrects OCR's month.
      if (existing && oldPath && imageStatus === 'uploaded') {
        const nextPath = buildScheduleImageStoragePath(
          existing.owner_id,
          existing.group_id,
          yearMonth,
          scheduleId,
          getShiftImageExtension(oldPath),
        );
        if (oldPath !== nextPath) {
          const { error: moveError } = await supabase.storage
            .from('shift-images')
            .move(oldPath, nextPath);
          if (moveError) {
            // Keep the only known object reference. It is still readable at
            // its old month path and can be retried/repaired later; blanking
            // it here would turn a recoverable move failure into data loss.
            imageStatus = 'unverified';
          } else {
            imageUrl = nextPath;
            movedFromPath = oldPath;
            movedToPath = nextPath;
          }
        }
      }
      const { error } = await supabase
        .from('schedules')
        .update({
          year_month: yearMonth,
          ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
          ...(imageStatus !== undefined ? { image_status: imageStatus } : {}),
        })
        .eq('id', scheduleId);

      if (error) {
        // Storage and Postgres cannot share one transaction. If the object was
        // moved but the row update failed, restore the old path so the
        // persisted schedule reference never points at a missing object.
        if (movedFromPath && movedToPath) {
          const { error: rollbackError } = await supabase.storage
            .from('shift-images')
            .move(movedToPath, movedFromPath);
          if (rollbackError) {
            console.warn('Failed to roll back schedule image move:', rollbackError);
          }
        }
        throw error;
      }

      set((state) => ({
        schedules: state.schedules.map((s) =>
          s.id === scheduleId
            ? { ...s, year_month: yearMonth, ...(imageUrl !== undefined ? { image_url: imageUrl } : {}), ...(imageStatus !== undefined ? { image_status: imageStatus } : {}) }
            : s
        ),
        currentSchedule:
          state.currentSchedule?.id === scheduleId
            ? { ...state.currentSchedule, year_month: yearMonth, ...(imageUrl !== undefined ? { image_url: imageUrl } : {}), ...(imageStatus !== undefined ? { image_status: imageStatus } : {}) }
            : state.currentSchedule,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update schedule year-month';
      set({ error: message });
      throw error;
    }
  },

  getUnsharedCount: async (userId: string, groupId: string) => {
    if (getIsGuest()) return 0;
    const { count, error } = await supabase
      .from('schedules')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .or(`group_id.is.null,group_id.neq.${groupId}`);
    if (error) {
      console.warn('Failed to get unshared count:', error);
      return 0;
    }
    return count ?? 0;
  },

  shareSchedulesWithGroup: async (userId: string, groupId: string) => {
    if (getIsGuest()) return 0;
    // Get unshared schedules
    const { data, error: fetchError } = await supabase
      .from('schedules')
      .select('id')
      .eq('owner_id', userId)
      .or(`group_id.is.null,group_id.neq.${groupId}`);
    if (fetchError) throw fetchError;
    if (!data || data.length === 0) return 0;

    const ids = data.map((s) => s.id);
    const { error: updateError } = await supabase
      .from('schedules')
      .update({ group_id: groupId })
      .in('id', ids);
    if (updateError) throw updateError;

    // Update local state
    set((state) => ({
      schedules: state.schedules.map((s) =>
        ids.includes(s.id) ? { ...s, group_id: groupId } : s
      ),
    }));
    return ids.length;
  },

  reset: () => {
    set({ schedules: [], currentSchedule: null, loading: false, error: null });
    AsyncStorage.removeItem(GUEST_SCHEDULES_KEY).catch(() => {});
  },
}));
