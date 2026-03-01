import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { getNextPersonColor } from '@shiftsnap/shared';
import { getIsGuest } from './authStore';
import { getGuestPersons } from '../data/guestDemoData';
import { useGroupStore } from './groupStore';

const GUEST_PERSONS_KEY = 'shiftsnap:guest-persons';

interface PersonItem {
  id: string;
  owner_id: string;
  group_id: string | null;
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
  createPerson: (userId: string, name: string, notes?: string, color?: string) => Promise<string>;
  updatePerson: (id: string, updates: Partial<Pick<PersonItem, 'name' | 'notes' | 'color'>>) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  reset: () => void;
}

export const usePersonStore = create<PersonState>((set, get) => ({
  persons: [],
  loading: false,
  error: null,

  fetchPersons: async (userId: string) => {
    if (getIsGuest()) {
      // Don't overwrite if persons already exist (e.g. coworkers just created)
      if (get().persons.length > 0) return;
      // Load persisted guest persons from AsyncStorage
      try {
        const stored = await AsyncStorage.getItem(GUEST_PERSONS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PersonItem[];
          if (parsed.length > 0) {
            set({ persons: parsed, loading: false });
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load guest persons:', e);
      }
      set({ persons: getGuestPersons(), loading: false });
      return;
    }
    set({ loading: true, error: null });
    try {
      const currentGroup = useGroupStore.getState().currentGroup;

      let query = supabase
        .from('persons')
        .select('*')
        .order('created_at');

      if (currentGroup) {
        query = query.or(`owner_id.eq.${userId},group_id.eq.${currentGroup.id}`);
      } else {
        query = query.eq('owner_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ persons: data || [], loading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch persons';
      set({ loading: false, error: message });
    }
  },

  createPerson: async (userId: string, name: string, notes?: string, color?: string) => {
    if (getIsGuest()) {
      const newPerson: PersonItem = {
        id: `g-person-local-${Date.now()}`,
        owner_id: 'guest-user',
        group_id: 'guest-group',
        name,
        color: color || '#4F6BFF',
        avatar_url: null,
        notes: notes || null,
        created_at: new Date().toISOString(),
      };
      const updatedPersons = [...get().persons, newPerson];
      set({ persons: updatedPersons });
      AsyncStorage.setItem(GUEST_PERSONS_KEY, JSON.stringify(updatedPersons)).catch(
        (e) => console.warn('Failed to persist guest persons:', e)
      );
      return newPerson.id;
    }
    try {
      const currentGroup = useGroupStore.getState().currentGroup;
      const usedColors = get().persons.map((p) => p.color);
      const personColor = color || getNextPersonColor(usedColors).hex;

      const { data, error } = await supabase
        .from('persons')
        .insert({
          owner_id: userId,
          group_id: currentGroup?.id || null,
          name,
          color: personColor,
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
    if (getIsGuest()) {
      const updatedPersons = get().persons.map((p) => (p.id === id ? { ...p, ...updates } : p));
      set({ persons: updatedPersons });
      AsyncStorage.setItem(GUEST_PERSONS_KEY, JSON.stringify(updatedPersons)).catch(
        (e) => console.warn('Failed to persist guest persons:', e)
      );
      return;
    }
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
    if (getIsGuest()) {
      const updatedPersons = get().persons.filter((p) => p.id !== id);
      set({ persons: updatedPersons });
      AsyncStorage.setItem(GUEST_PERSONS_KEY, JSON.stringify(updatedPersons)).catch(
        (e) => console.warn('Failed to persist guest persons:', e)
      );
      return;
    }
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

  reset: () => {
    set({ persons: [], loading: false, error: null });
    AsyncStorage.removeItem(GUEST_PERSONS_KEY).catch(() => {});
  },
}));
