import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { getNextPersonColor } from '@shiftsnap/shared';

interface PersonItem {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
}

interface PersonState {
  persons: PersonItem[];
  loading: boolean;
  error: string | null;

  fetchPersons: (userId: string) => Promise<void>;
  createPerson: (userId: string, name: string, notes?: string) => Promise<string>;
  updatePerson: (id: string, updates: Partial<Pick<PersonItem, 'name' | 'notes' | 'color'>>) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
}

export const usePersonStore = create<PersonState>((set, get) => ({
  persons: [],
  loading: false,
  error: null,

  fetchPersons: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('persons')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at');

      if (error) throw error;
      set({ persons: data || [], loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch persons';
      set({ loading: false, error: message });
    }
  },

  createPerson: async (userId: string, name: string, notes?: string) => {
    try {
      const usedColors = get().persons.map((p) => p.color);
      const nextColor = getNextPersonColor(usedColors);

      const { data, error } = await supabase
        .from('persons')
        .insert({
          owner_id: userId,
          name,
          color: nextColor.hex,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      set((state) => ({ persons: [...state.persons, data] }));
      return data.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create person';
      set({ error: message });
      throw error;
    }
  },

  updatePerson: async (id: string, updates: Partial<Pick<PersonItem, 'name' | 'notes' | 'color'>>) => {
    try {
      const { error } = await supabase.from('persons').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        persons: state.persons.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update person';
      set({ error: message });
      throw error;
    }
  },

  deletePerson: async (id: string) => {
    try {
      const { error } = await supabase.from('persons').delete().eq('id', id);
      if (error) throw error;

      set((state) => ({
        persons: state.persons.filter((p) => p.id !== id),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete person';
      set({ error: message });
      throw error;
    }
  },
}));
