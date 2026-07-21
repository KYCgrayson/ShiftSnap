import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  supabase,
  signOut as supabaseSignOut,
  getCurrentSession,
  signInWithGoogle as googleSignIn,
  signInWithApple as appleSignIn,
} from '../services/supabase';

const GUEST_MODE_KEY = 'shiftsnap:guest-mode';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  isGuest: boolean;

  // Actions
  initialize: () => Promise<void>;
  signInAsGuest: () => void;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signInWithApple: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

/** Check guest status from outside React (e.g. in other stores). */
export const getIsGuest = () => useAuthStore.getState().isGuest;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,
  error: null,
  isGuest: false,

  initialize: async () => {
    try {
      set({ loading: true });

      // Get current session
      const { session, error } = await getCurrentSession();

      if (error) {
        console.error('Unable to restore authentication session');
      }

      if (session) {
        set({
          user: session.user,
          session,
          initialized: true,
          loading: false,
        });
      } else {
        // No Supabase session — check if guest mode was active
        try {
          const wasGuest = await AsyncStorage.getItem(GUEST_MODE_KEY);
          if (wasGuest === 'true') {
            // Restore guest session
            const guestUser = {
              id: 'guest-user',
              email: 'guest@shiftsnap.local',
              app_metadata: {},
              user_metadata: { display_name: 'Guest User' },
              aud: 'authenticated',
              created_at: new Date().toISOString(),
            } as User;
            set({ user: guestUser, session: null, isGuest: true, initialized: true, loading: false });
          } else {
            set({ user: null, session: null, initialized: true, loading: false });
          }
        } catch {
          set({ user: null, session: null, initialized: true, loading: false });
        }
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        // Don't let Supabase events without a session (e.g. a signup that
        // requires email confirmation) wipe out an active guest session.
        const current = get();
        if (current.isGuest && !session) return;
        set({
          user: session?.user ?? null,
          session,
          isGuest: session ? false : current.isGuest,
        });
      });
    } catch {
      console.error('Authentication initialization failed');
      set({ user: null, session: null, initialized: true, loading: false });
    }
  },

  signInAsGuest: () => {
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
      loading: false,
      error: null,
    });
    AsyncStorage.setItem(GUEST_MODE_KEY, 'true').catch(() => {
      console.warn('Failed to persist guest mode');
    });
  },

  signInWithGoogle: async () => {
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
      set({
        user: data.user,
        session: data.session,
        loading: false,
        error: null,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign in failed';
      set({ loading: false, error: message });
      return { success: false, error: message };
    }
  },

  signInWithApple: async () => {
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
      set({
        user: data.user,
        session: data.session,
        loading: false,
        error: null,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Apple sign in failed';
      set({ loading: false, error: message });
      return { success: false, error: message };
    }
  },

  signOut: async () => {
    const { isGuest } = get();
    set({ loading: true });

    try {
      if (!isGuest) {
        await supabaseSignOut();
      }

      // Reset all data stores to prevent stale guest data
      const { useShiftStore } = require('./shiftStore');
      const { useShiftCodeStore } = require('./shiftCodeStore');
      const { useScheduleStore } = require('./scheduleStore');
      const { usePersonStore } = require('./personStore');
      const { useGroupStore } = require('./groupStore');
      const { useCalendarStore } = require('./calendarStore');
      useShiftStore.getState().reset();
      useShiftCodeStore.getState().reset();
      useScheduleStore.getState().reset();
      usePersonStore.getState().reset();
      useGroupStore.getState().reset();
      useCalendarStore.getState().disconnectCalendar();

      set({ user: null, session: null, isGuest: false, loading: false, error: null });
      AsyncStorage.removeItem(GUEST_MODE_KEY).catch(() => {});
    } catch {
      console.error('Sign out failed');
      set({ loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
