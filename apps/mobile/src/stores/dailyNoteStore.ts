import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { getIsGuest } from './authStore';
import type { DailyNote } from '@shiftsnap/shared';

const GUEST_NOTES_KEY = 'shiftsnap_daily_notes';

interface DailyNoteState {
  notesByDate: Record<string, DailyNote>;
  loading: boolean;

  fetchNotesForMonth: (userId: string, yearMonth: string) => Promise<void>;
  saveNote: (
    userId: string,
    date: string,
    content: string,
    imageUrls?: string[],
  ) => Promise<void>;
  reset: () => void;
}

async function loadGuestNotes(): Promise<Record<string, DailyNote>> {
  const raw = await AsyncStorage.getItem(GUEST_NOTES_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function persistGuestNotes(notes: Record<string, DailyNote>) {
  await AsyncStorage.setItem(GUEST_NOTES_KEY, JSON.stringify(notes));
}

export const useDailyNoteStore = create<DailyNoteState>((set, get) => ({
  notesByDate: {},
  loading: false,

  fetchNotesForMonth: async (userId: string, yearMonth: string) => {
    if (getIsGuest()) {
      const all = await loadGuestNotes();
      // Filter to current month
      const filtered: Record<string, DailyNote> = {};
      for (const [date, note] of Object.entries(all)) {
        if (date.startsWith(yearMonth)) {
          filtered[date] = note;
        }
      }
      set({ notesByDate: filtered });
      return;
    }

    set({ loading: true });
    try {
      const startDate = `${yearMonth}-01`;
      const [y, m] = yearMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('daily_notes')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) throw error;

      const byDate: Record<string, DailyNote> = {};
      data?.forEach((note) => {
        byDate[note.date] = note;
      });
      set({ notesByDate: byDate, loading: false });
    } catch (error) {
      console.error('Failed to fetch daily notes:', error);
      set({ loading: false });
    }
  },

  saveNote: async (userId: string, date: string, content: string, imageUrls: string[] = []) => {
    const trimmed = content.trim();
    // Note is meaningful if it has either text or images.
    const hasContent = trimmed.length > 0 || imageUrls.length > 0;

    if (getIsGuest()) {
      const all = await loadGuestNotes();
      if (!hasContent) {
        delete all[date];
      } else {
        const existing = all[date];
        all[date] = {
          id: existing?.id || `g-note-${Date.now()}`,
          user_id: userId,
          date,
          content: trimmed,
          image_urls: imageUrls,
          created_at: existing?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      await persistGuestNotes(all);
      // Update in-memory state
      const month = date.substring(0, 7);
      const filtered: Record<string, DailyNote> = {};
      for (const [d, note] of Object.entries(all)) {
        if (d.startsWith(month)) {
          filtered[d] = note;
        }
      }
      set({ notesByDate: filtered });
      return;
    }

    try {
      if (!hasContent) {
        // Delete note
        await supabase
          .from('daily_notes')
          .delete()
          .eq('user_id', userId)
          .eq('date', date);

        set((state) => {
          const next = { ...state.notesByDate };
          delete next[date];
          return { notesByDate: next };
        });
      } else {
        // Upsert note
        const { data, error } = await supabase
          .from('daily_notes')
          .upsert(
            {
              user_id: userId,
              date,
              content: trimmed,
              image_urls: imageUrls,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,date' }
          )
          .select()
          .single();

        if (error) throw error;

        set((state) => ({
          notesByDate: { ...state.notesByDate, [date]: data },
        }));
      }
    } catch (error) {
      console.error('Failed to save daily note:', error);
      throw error;
    }
  },

  reset: () => {
    set({ notesByDate: {}, loading: false });
  },
}));
