import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  supabase,
  signOut as supabaseSignOut,
  clearLocalSupabaseSession,
  getCurrentSession,
  signInWithGoogle as googleSignIn,
  signInWithApple as appleSignIn,
} from '../services/supabase';
import {
  clearOfflineIdentity, clearOfflineLocalSignOut, clearOfflineSnapshots, getLastAuthenticatedUser,
  hasOfflineLocalSignOut, markOfflineLocalSignOut,
  hasOfflineSnapshotForUser, invalidateOfflineReadRequests, saveLastAuthenticatedUser,
  readLatestOfflineSnapshot, withReadTimeout, getOfflineReadGeneration, isOfflineReadRequestCurrent,
  isOfflineReadGenerationCurrent, setOfflineReadUserId,
} from '../services/offlineReadCache';

const GUEST_MODE_KEY = 'shiftsnap:guest-mode';
let localSignOutRequested = false;
let authListenerRegistered = false;

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  isGuest: boolean;
  isOfflineReadOnly: boolean;
  offlineReadOnlyReason: 'offline' | null;
  offlineLastUpdatedAt: string | null;
  setOfflineReadOnly: (offline: boolean) => void;

  // Actions
  initialize: () => Promise<void>;
  retryOnlineSession: () => Promise<boolean>;
  signInAsGuest: () => void;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signInWithApple: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

/** Check guest status from outside React (e.g. in other stores). */
export const getIsGuest = () => useAuthStore.getState().isGuest;
export const getIsOfflineReadOnly = () => useAuthStore.getState().isOfflineReadOnly;

function registerAuthStateListener(
  set: (state: Partial<AuthState>) => void,
  get: () => AuthState,
): void {
  if (authListenerRegistered) return;
  authListenerRegistered = true;
  supabase.auth.onAuthStateChange((event, session) => {
    const current = get();
    if (localSignOutRequested && event !== 'SIGNED_OUT' && session) return;
    if (current.isGuest && !session) return;
    if (!session && current.isOfflineReadOnly && event !== 'SIGNED_OUT') return;
    if (session?.user?.id && current.user?.id && session.user.id !== current.user.id) {
      invalidateOfflineReadRequests();
      resetLocalStores();
    }
    if (event === 'SIGNED_OUT') {
      invalidateOfflineReadRequests();
      setOfflineReadUserId(null);
      void markOfflineLocalSignOut();
      void clearOfflineIdentity();
      if (current.user?.id) void clearOfflineSnapshots(current.user.id);
      resetLocalStores();
    } else if (session?.user?.id) {
      setOfflineReadUserId(session.user.id);
      if (event === 'SIGNED_IN') clearOfflineLocalSignOut().catch(() => undefined);
    }
    set({
      user: session?.user ?? null,
      session,
      isGuest: session ? false : current.isGuest,
      isOfflineReadOnly: session ? false : current.isOfflineReadOnly,
      offlineReadOnlyReason: session ? null : current.offlineReadOnlyReason,
    });
    if (session?.user?.id) saveLastAuthenticatedUser(session.user.id, getOfflineReadGeneration()).catch(() => undefined);
  });
}

function resetLocalStores(): void {
  const { useShiftStore } = require('./shiftStore');
  const { useShiftCodeStore } = require('./shiftCodeStore');
  const { useScheduleStore } = require('./scheduleStore');
  const { usePersonStore } = require('./personStore');
  const { useGroupStore } = require('./groupStore');
  const { useCalendarStore } = require('./calendarStore');
  const { useDailyNoteStore } = require('./dailyNoteStore');
  useShiftStore.getState().reset();
  useShiftCodeStore.getState().reset();
  useScheduleStore.getState().reset();
  usePersonStore.getState().reset();
  useGroupStore.getState().reset();
  useDailyNoteStore.getState().reset();
  useCalendarStore.getState().disconnectCalendar();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,
  error: null,
  isGuest: false,
  isOfflineReadOnly: false,
  offlineReadOnlyReason: null,
  offlineLastUpdatedAt: null,
  setOfflineReadOnly: (offline) => {
    const state = get();
    if (!offline && !state.session) return;
    set({ isOfflineReadOnly: offline, offlineReadOnlyReason: offline ? 'offline' : null, offlineLastUpdatedAt: offline ? state.offlineLastUpdatedAt : new Date().toISOString() });
  },

  initialize: async () => {
    const generation = getOfflineReadGeneration();
    try {
      set({ loading: true });

      // Get current session
      const signedOutLocally = await hasOfflineLocalSignOut().catch(() => false);
      if (!isOfflineReadGenerationCurrent(generation)) return;
      if (signedOutLocally) localSignOutRequested = true;
      if (signedOutLocally) await clearLocalSupabaseSession().catch(() => undefined);
      const { session, error } = signedOutLocally
        ? { session: null, error: null }
        : await withReadTimeout(getCurrentSession(), 4_000).catch((requestError) => ({ session: null, error: requestError }));
      if (!isOfflineReadGenerationCurrent(generation)) return;

      if (error) {
        console.error('Unable to restore authentication session');
      }

      if (session) {
        setOfflineReadUserId(session.user.id);
        await saveLastAuthenticatedUser(session.user.id, generation).catch(() => undefined);
        if (!isOfflineReadRequestCurrent(generation, session.user.id)) return;
        set({ user: session.user, session, isGuest: false, isOfflineReadOnly: false, offlineReadOnlyReason: null, offlineLastUpdatedAt: null, initialized: true, loading: false });
      } else {
        const cachedUserId = await getLastAuthenticatedUser().catch(() => null);
        if (!isOfflineReadGenerationCurrent(generation)) return;
        if (!signedOutLocally && cachedUserId && await hasOfflineSnapshotForUser(cachedUserId)) {
          setOfflineReadUserId(cachedUserId);
          const latestSnapshot = await readLatestOfflineSnapshot(cachedUserId);
          if (!isOfflineReadRequestCurrent(generation, cachedUserId)) return;
          set({
            user: {
              id: cachedUserId, app_metadata: {}, user_metadata: {},
              aud: 'authenticated', created_at: new Date().toISOString(),
            } as User,
            session: null,
            isGuest: false,
            isOfflineReadOnly: true,
            offlineReadOnlyReason: 'offline',
            offlineLastUpdatedAt: latestSnapshot?.updatedAt || null,
            initialized: true,
            loading: false,
          });
          const { useGroupStore } = require('./groupStore');
          await useGroupStore.getState().fetchGroups(cachedUserId);
        } else {
        setOfflineReadUserId(null);
        // No Supabase session — check if guest mode was active
        try {
          const wasGuest = await AsyncStorage.getItem(GUEST_MODE_KEY);
          if (!isOfflineReadGenerationCurrent(generation)) return;
          if (wasGuest === 'true' && !signedOutLocally) {
            // Restore guest session
            const guestUser = {
              id: 'guest-user',
              email: 'guest@shiftsnap.local',
              app_metadata: {},
              user_metadata: { display_name: 'Guest User' },
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as User;
            set({ user: guestUser, session: null, isGuest: true, isOfflineReadOnly: false, offlineReadOnlyReason: null, initialized: true, loading: false });
          } else {
            set({ user: null, session: null, isOfflineReadOnly: false, offlineReadOnlyReason: null, initialized: true, loading: false });
          }
        } catch {
          set({ user: null, session: null, initialized: true, loading: false });
        }
        }
      }

      registerAuthStateListener(set, get);
    } catch {
      if (!isOfflineReadGenerationCurrent(generation)) return;
      console.error('Authentication initialization failed');
      const cachedUserId = await getLastAuthenticatedUser().catch(() => null);
      if (!isOfflineReadGenerationCurrent(generation)) return;
      if (cachedUserId && await hasOfflineSnapshotForUser(cachedUserId)) {
        if (!isOfflineReadGenerationCurrent(generation)) return;
        setOfflineReadUserId(cachedUserId);
        const latestSnapshot = await readLatestOfflineSnapshot(cachedUserId);
        if (!isOfflineReadRequestCurrent(generation, cachedUserId)) return;
        set({ user: { id: cachedUserId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() } as User, session: null, isGuest: false, isOfflineReadOnly: true, offlineReadOnlyReason: 'offline', offlineLastUpdatedAt: latestSnapshot?.updatedAt || null, initialized: true, loading: false });
      } else {
        if (!isOfflineReadGenerationCurrent(generation)) return;
        setOfflineReadUserId(null);
        set({ user: null, session: null, initialized: true, loading: false });
      }
      registerAuthStateListener(set, get);
    }
  },

  retryOnlineSession: async () => {
    const generation = getOfflineReadGeneration();
    try {
      const { session } = await withReadTimeout(getCurrentSession(), 4_000);
      if (!isOfflineReadGenerationCurrent(generation)) return false;
      if (!session) return false;
      const current = get();
      if (current.user?.id && current.user.id !== session.user.id) resetLocalStores();
      if (current.user?.id && current.user.id !== session.user.id) invalidateOfflineReadRequests();
      setOfflineReadUserId(session.user.id);
      const currentGeneration = getOfflineReadGeneration();
      await saveLastAuthenticatedUser(session.user.id, currentGeneration).catch(() => undefined);
      if (!isOfflineReadRequestCurrent(currentGeneration, session.user.id)) return false;
      set({ user: session.user, session, isGuest: false, isOfflineReadOnly: false, offlineReadOnlyReason: null, offlineLastUpdatedAt: null });
      localSignOutRequested = false;
      return true;
    } catch {
      return false;
    }
  },

  signInAsGuest: () => {
    localSignOutRequested = false;
    clearOfflineLocalSignOut().catch(() => undefined);
    invalidateOfflineReadRequests();
    setOfflineReadUserId('guest-user');
    clearOfflineIdentity().catch(() => undefined);
    resetLocalStores();
    const guestUser = {
      id: 'guest-user',
      email: 'guest@shiftsnap.local',
      app_metadata: {},
      user_metadata: { display_name: 'Guest User' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as User;

    set({
      user: guestUser,
      session: null,
      isGuest: true,
      isOfflineReadOnly: false,
      offlineReadOnlyReason: null,
      loading: false,
      error: null,
    });
    AsyncStorage.setItem(GUEST_MODE_KEY, 'true').catch(() => {
      console.warn('Failed to persist guest mode');
    });
  },

  signInWithGoogle: async () => {
    invalidateOfflineReadRequests();
    const generation = getOfflineReadGeneration();
    set({ loading: true, error: null });
    try {
      const { data, error } = await googleSignIn();
      if (error) {
        set({ loading: false, error: error.message });
        return { success: false, error: error.message };
      }
      if (!data) {
        set({ loading: false });
        return { success: false }; // User cancelled
      }
      if (!data.user) {
        set({ loading: false, error: 'Google sign in did not return a user' });
        return { success: false, error: 'Google sign in did not return a user' };
      }
      if (!isOfflineReadGenerationCurrent(generation) && get().user?.id !== data.user.id) return { success: false, error: 'Sign-in was cancelled by a local account change' };
      if (get().user?.id && get().user?.id !== data.user.id) resetLocalStores();
      if (get().user?.id && get().user?.id !== data.user.id) invalidateOfflineReadRequests();
      localSignOutRequested = false;
      await clearOfflineLocalSignOut().catch(() => undefined);
      setOfflineReadUserId(data.user.id);
      const currentGeneration = getOfflineReadGeneration();
      set({
        user: data.user,
        session: data.session,
        isGuest: false,
        isOfflineReadOnly: false,
        offlineReadOnlyReason: null,
        offlineLastUpdatedAt: null,
        loading: false,
        error: null,
      });
      await saveLastAuthenticatedUser(data.user.id, currentGeneration).catch(() => undefined);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign in failed';
      set({ loading: false, error: message });
      return { success: false, error: message };
    }
  },

  signInWithApple: async () => {
    invalidateOfflineReadRequests();
    const generation = getOfflineReadGeneration();
    set({ loading: true, error: null });
    try {
      const { data, error } = await appleSignIn();
      if (error) {
        set({ loading: false, error: error.message });
        return { success: false, error: error.message };
      }
      if (!data) {
        set({ loading: false });
        return { success: false }; // User cancelled
      }
      if (!data.user) {
        set({ loading: false, error: 'Apple sign in did not return a user' });
        return { success: false, error: 'Apple sign in did not return a user' };
      }
      if (!isOfflineReadGenerationCurrent(generation) && get().user?.id !== data.user.id) return { success: false, error: 'Sign-in was cancelled by a local account change' };
      if (get().user?.id && get().user?.id !== data.user.id) resetLocalStores();
      if (get().user?.id && get().user?.id !== data.user.id) invalidateOfflineReadRequests();
      localSignOutRequested = false;
      await clearOfflineLocalSignOut().catch(() => undefined);
      setOfflineReadUserId(data.user.id);
      const currentGeneration = getOfflineReadGeneration();
      set({
        user: data.user,
        session: data.session,
        isGuest: false,
        isOfflineReadOnly: false,
        offlineReadOnlyReason: null,
        offlineLastUpdatedAt: null,
        loading: false,
        error: null,
      });
      await saveLastAuthenticatedUser(data.user.id, currentGeneration).catch(() => undefined);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Apple sign in failed';
      set({ loading: false, error: message });
      return { success: false, error: message };
    }
  },

  signOut: async () => {
    const { isGuest, user } = get();
    localSignOutRequested = true;
    set({ user: null, session: null, isGuest: false, isOfflineReadOnly: false, offlineReadOnlyReason: null, loading: true, error: null });
    invalidateOfflineReadRequests();
    setOfflineReadUserId(null);
    await markOfflineLocalSignOut().catch(() => undefined);
    await clearOfflineIdentity();
    await clearLocalSupabaseSession().catch(() => undefined);
    if (user?.id && !isGuest) await clearOfflineSnapshots(user.id);
    resetLocalStores();
    AsyncStorage.removeItem(GUEST_MODE_KEY).catch(() => {});
    if (!isGuest) {
      try {
        await withReadTimeout(supabaseSignOut(), 3_000);
      } catch {
        console.error('Remote sign out did not finish; local account data was cleared');
      }
    }
    set({ loading: false });
  },

  clearError: () => {
    set({ error: null });
  },
}));
