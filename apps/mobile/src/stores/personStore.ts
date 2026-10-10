import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { getNextPersonColor } from '@shiftsnap/shared';
import { canSuggestRosterMatch, rosterNameSimilarity, type RosterNameSensitivity } from '@shiftsnap/shared';
import { getIsGuest, getIsOfflineReadOnly, useAuthStore } from './authStore';
import { getGuestPersons } from '../data/guestDemoData';
import { hydrateCachedGroups, useGroupStore } from './groupStore';
import { getOfflineReadGeneration, isOfflineReadRequestCurrent, readOfflineSnapshot, saveOfflineSnapshotPatch, withReadTimeout } from '../services/offlineReadCache';

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
  canonical_person_id: string | null;
}

export interface PersonAliasItem {
  id: string;
  group_id: string;
  canonical_person_id: string;
  alias: string;
  normalized_alias: string;
  created_at: string;
}

export interface RosterMergeItem {
  id: string;
  group_id: string;
  primary_person_id: string;
  secondary_person_id: string;
  created_at: string;
  undone_at: string | null;
}

export interface RosterSuggestion {
  sourcePersonId: string;
  candidatePersonId: string;
  sourceName: string;
  candidateName: string;
  similarity: number;
}

interface PersonState {
  persons: PersonItem[];
  aliases: PersonAliasItem[];
  rosterMerges: RosterMergeItem[];
  rosterSuggestions: RosterSuggestion[];
  loading: boolean;
  error: string | null;

  fetchPersons: (userId: string) => Promise<void>;
  createPerson: (userId: string, name: string, notes?: string, color?: string) => Promise<string>;
  updatePerson: (id: string, updates: Partial<Pick<PersonItem, 'name' | 'notes' | 'color'>>) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  fetchAliases: (groupId: string) => Promise<void>;
  resolveRosterPerson: (groupId: string, name: string, color?: string) => Promise<string>;
  mergeRosterPeople: (primaryPersonId: string, secondaryPersonId: string) => Promise<string>;
  undoRosterPeopleMerge: (mergeId: string) => Promise<void>;
  fetchRosterMerges: (groupId: string) => Promise<void>;
  fetchRosterSuggestions: (groupId: string, sensitivity: RosterNameSensitivity) => Promise<void>;
  reset: () => void;
}

export const usePersonStore = create<PersonState>((set, get) => ({
  persons: [],
  aliases: [],
  rosterMerges: [],
  rosterSuggestions: [],
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
    await hydrateCachedGroups(userId);
    const { groups, viewScope } = useGroupStore.getState();
    const groupIds = groups.map((group) => group.id).filter((id) => id !== 'guest-group');
    const scope = { groupIds, viewScope };
    const generation = getOfflineReadGeneration();
    const snapshot = await readOfflineSnapshot(userId, scope);
    if (!isOfflineReadRequestCurrent(generation, userId)) return;
    set({ persons: snapshot?.persons ? snapshot.persons as PersonItem[] : [], loading: getIsOfflineReadOnly(), error: null });
    if (getIsOfflineReadOnly()) return;
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

      const { data, error } = await withReadTimeout(query);
      if (error) throw error;
      if (!isOfflineReadRequestCurrent(generation, userId)) return;
      const persons = data || [];
      set({ persons, loading: false });
      await saveOfflineSnapshotPatch(userId, scope, { persons }, generation);
    } catch (error) {
      if (!isOfflineReadRequestCurrent(generation, userId)) return;
      const message = error instanceof Error ? error.message : 'Failed to fetch persons';
      set({ loading: false, error: message });
      useAuthStore.getState().setOfflineReadOnly(true);
      const snapshot = await readOfflineSnapshot(userId, scope);
      if (isOfflineReadRequestCurrent(generation, userId) && snapshot?.persons) set({ persons: snapshot.persons as PersonItem[] });
    }
  },

  createPerson: async (userId: string, name: string, notes?: string, color?: string) => {
    if (getIsGuest()) {
      const guestId = `g-person-local-${Date.now()}`;
      const newPerson: PersonItem = {
        id: guestId,
        owner_id: 'guest-user',
        group_id: 'guest-group',
        name,
        color: color || '#4F6BFF',
        avatar_url: null,
        notes: notes || null,
        created_at: new Date().toISOString(),
        canonical_person_id: guestId,
      };
      const updatedPersons = [...get().persons, newPerson];
      set({ persons: updatedPersons });
      AsyncStorage.setItem(GUEST_PERSONS_KEY, JSON.stringify(updatedPersons)).catch(
        (e) => console.warn('Failed to persist guest persons:', e)
      );
      return newPerson.id;
    }
    if (getIsOfflineReadOnly()) throw new Error('Offline mode is read-only. Reconnect to edit people.');
    try {
      const currentGroup = useGroupStore.getState().currentGroup;
      if (currentGroup?.id) {
        const { data, error } = await supabase.rpc('resolve_roster_person', {
          p_group_id: currentGroup.id,
          p_name: name,
          p_color: color || '#4F6BFF',
        });
        if (error || !data) throw error ?? new Error('Failed to resolve roster person');
        await Promise.all([get().fetchPersons(userId), get().fetchAliases(currentGroup.id)]);
        return data as string;
      }
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
    if (getIsOfflineReadOnly()) throw new Error('Offline mode is read-only. Reconnect to edit people.');
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
    if (getIsOfflineReadOnly()) throw new Error('Offline mode is read-only. Reconnect to edit people.');
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

  fetchAliases: async (groupId: string) => {
    if (getIsGuest()) {
      set({ aliases: [] });
      return;
    }
    const { data, error } = await supabase
      .from('person_aliases')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at');
    if (error) throw error;
    set({ aliases: (data || []) as PersonAliasItem[] });
  },

  resolveRosterPerson: async (groupId: string, name: string, color?: string) => {
    if (getIsGuest()) {
      const existing = get().persons.find((person) => person.name === name);
      return existing?.id ?? get().createPerson('guest-user', name, undefined, color);
    }
    if (getIsOfflineReadOnly()) throw new Error('Offline mode is read-only. Reconnect to edit people.');
    const { data, error } = await supabase.rpc('resolve_roster_person', {
      p_group_id: groupId,
      p_name: name,
      p_color: color ?? '#4F6BFF',
    });
    if (error || !data) throw error ?? new Error('Failed to resolve roster person');
    return data as string;
  },

  mergeRosterPeople: async (primaryPersonId: string, secondaryPersonId: string) => {
    if (getIsOfflineReadOnly()) throw new Error('Offline mode is read-only. Reconnect to edit people.');
    const { data, error } = await supabase.rpc('merge_roster_people', {
      p_primary_person_id: primaryPersonId,
      p_secondary_person_id: secondaryPersonId,
    });
    if (error || !data) throw error ?? new Error('Failed to merge roster people');
    return data as string;
  },

  undoRosterPeopleMerge: async (mergeId: string) => {
    if (getIsOfflineReadOnly()) throw new Error('Offline mode is read-only. Reconnect to edit people.');
    const { error } = await supabase.rpc('undo_roster_people_merge', { p_merge_id: mergeId });
    if (error) throw error;
  },

  fetchRosterMerges: async (groupId: string) => {
    if (getIsGuest()) return;
    const { data, error } = await supabase
      .from('roster_identity_merges')
      .select('id, group_id, primary_person_id, secondary_person_id, created_at, undone_at')
      .eq('group_id', groupId)
      .is('undone_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    set({ rosterMerges: (data || []) as RosterMergeItem[] });
  },

  fetchRosterSuggestions: async (groupId: string, sensitivity: RosterNameSensitivity) => {
    if (getIsGuest()) return;
    const { data: schedules, count: scheduleCount, error: scheduleError } = await supabase
      .from('schedules')
      .select('id', { count: 'exact' })
      .eq('group_id', groupId)
      .limit(100);
    if (scheduleError) throw scheduleError;
    // Suggestions must never be built from incomplete co-occurrence history.
    // Large groups can still use exact/numeric matching and manual merge.
    if ((scheduleCount ?? 0) > 100) {
      set({ rosterSuggestions: [] });
      return;
    }
    const scheduleIds = (schedules || []).map((schedule) => schedule.id);
    if (scheduleIds.length === 0) {
      set({ rosterSuggestions: [] });
      return;
    }
    const { data: shifts, count: shiftCount, error: shiftError } = await supabase
      .from('shifts')
      .select('schedule_id, name_on_schedule, person_id', { count: 'exact' })
      .in('schedule_id', scheduleIds)
      .not('name_on_schedule', 'is', null)
      .limit(5000);
    if (shiftError) throw shiftError;
    if ((shiftCount ?? 0) > 5000) {
      set({ rosterSuggestions: [] });
      return;
    }
    const namesBySchedule = new Map<string, Set<string>>();
    const personById = new Map(get().persons.map((person) => [person.id, person]));
    const aliasNamesByCanonical = new Map<string, Set<string>>();
    for (const person of get().persons) {
      const canonicalId = person.canonical_person_id ?? person.id;
      const names = aliasNamesByCanonical.get(canonicalId) ?? new Set<string>();
      names.add(person.name);
      aliasNamesByCanonical.set(canonicalId, names);
    }
    for (const alias of get().aliases) {
      const names = aliasNamesByCanonical.get(alias.canonical_person_id) ?? new Set<string>();
      names.add(alias.alias);
      aliasNamesByCanonical.set(alias.canonical_person_id, names);
    }
    const canonicalIdsBySchedule = new Map<string, Set<string>>();
    for (const shift of shifts || []) {
      if (shift.name_on_schedule) {
        const names = namesBySchedule.get(shift.schedule_id) ?? new Set<string>();
        names.add(shift.name_on_schedule);
        namesBySchedule.set(shift.schedule_id, names);
      }
      const person = shift.person_id ? personById.get(shift.person_id) : null;
      if (person) {
        const ids = canonicalIdsBySchedule.get(shift.schedule_id) ?? new Set<string>();
        ids.add(person.canonical_person_id ?? person.id);
        canonicalIdsBySchedule.set(shift.schedule_id, ids);
      }
    }
    const canonicalPeople = get().persons.filter((person) => person.group_id === groupId && (person.canonical_person_id ?? person.id) === person.id);
    const suggestions: RosterSuggestion[] = [];
    for (let i = 0; i < canonicalPeople.length; i += 1) {
      for (let j = i + 1; j < canonicalPeople.length; j += 1) {
        const source = canonicalPeople[i];
        const candidate = canonicalPeople[j];
        const cooccursById = Array.from(canonicalIdsBySchedule.values()).some((ids) => ids.has(source.id) && ids.has(candidate.id));
        const sourceNames = aliasNamesByCanonical.get(source.id) ?? new Set([source.name]);
        const candidateNames = aliasNamesByCanonical.get(candidate.id) ?? new Set([candidate.name]);
        const cooccursByRawName = Array.from(namesBySchedule.values()).some((names) =>
          Array.from(sourceNames).some((name) => names.has(name))
          && Array.from(candidateNames).some((name) => names.has(name))
        );
        const cooccurs = cooccursById || cooccursByRawName;
        if (!canSuggestRosterMatch(source.name, candidate.name, cooccurs ? [source.name, candidate.name] : [source.name], sensitivity)) continue;
        suggestions.push({
          sourcePersonId: source.id,
          candidatePersonId: candidate.id,
          sourceName: source.name,
          candidateName: candidate.name,
          similarity: rosterNameSimilarity(source.name, candidate.name),
        });
      }
    }
    set({ rosterSuggestions: suggestions.sort((a, b) => b.similarity - a.similarity).slice(0, 8) });
  },

  reset: () => {
    set({ persons: [], aliases: [], rosterMerges: [], rosterSuggestions: [], loading: false, error: null });
    AsyncStorage.removeItem(GUEST_PERSONS_KEY).catch(() => {});
  },
}));
