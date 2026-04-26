import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  supabase,
  signInWithEmail,
  signUpWithEmail,
  signOut as supabaseSignOut,
  getCurrentSession,
  signInWithGoogle as googleSignIn,
  signInWithApple as appleSignIn,
} from '../services/supabase';

const GUEST_MODE_KEY = 'shiftsnap:guest-mode';

// Shared demo account — credentials are intentionally public.
// The account is for exploration only; do not put real PII into it.
const DEMO_EMAIL = 'demo@ishift.app';
const DEMO_PASSWORD = 'DemoIShift2026!';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  isGuest: boolean;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  signInAsGuest: () => void;
  signInAsDemo: () => Promise<{ success: boolean; error?: string }>;
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
        console.error('Error getting session:', error);
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
        set({
          user: session?.user ?? null,
          session,
        });
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ user: null, session: null, initialized: true, loading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null });

    try {
      const { data, error } = await signInWithEmail(email, password);

      if (error) {
        set({ loading: false, error: error.message });
        return { success: false, error: error.message };
      }

      set({
        user: data.user,
        session: data.session,
        loading: false,
        error: null,
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      set({ loading: false, error: message });
      return { success: false, error: message };
    }
  },

  signUp: async (email: string, password: string, displayName?: string) => {
    set({ loading: true, error: null });

    try {
      const { data, error } = await signUpWithEmail(email, password, displayName);

      if (error) {
        set({ loading: false, error: error.message });
        return { success: false, error: error.message };
      }

      // Note: User might need to verify email before they can sign in
      if (data.user && !data.session) {
        set({ loading: false });
        return { success: true };
      }

      set({
        user: data.user,
        session: data.session,
        loading: false,
        error: null,
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      set({ loading: false, error: message });
      return { success: false, error: message };
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
    AsyncStorage.setItem(GUEST_MODE_KEY, 'true').catch(
      (e) => console.warn('Failed to persist guest mode:', e)
    );
  },

  signInAsDemo: async () => {
    set({ loading: true, error: null });
    try {
      let user: User | null = null;
      let session: Session | null = null;

      // Try sign in first; on first run the account may not exist yet,
      // in which case we sign it up and then sign in.
      const first = await signInWithEmail(DEMO_EMAIL, DEMO_PASSWORD);
      if (first.data?.session) {
        user = first.data.user;
        session = first.data.session;
      } else {
        const signup = await signUpWithEmail(DEMO_EMAIL, DEMO_PASSWORD, 'Demo User');
        if (signup.error) {
          set({ loading: false, error: signup.error.message });
          return { success: false, error: signup.error.message };
        }
        if (signup.data?.session) {
          user = signup.data.user;
          session = signup.data.session;
        } else {
          // Email-confirmation flow: try sign in once more in case it's auto-confirmed.
          const retry = await signInWithEmail(DEMO_EMAIL, DEMO_PASSWORD);
          if (retry.error || !retry.data?.session) {
            const msg = retry.error?.message ?? 'Demo account unavailable';
            set({ loading: false, error: msg });
            return { success: false, error: msg };
          }
          user = retry.data.user;
          session = retry.data.session;
        }
      }

      await AsyncStorage.removeItem(GUEST_MODE_KEY).catch(() => {});
      set({ user, session, isGuest: false, loading: false, error: null });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Demo sign in failed';
      set({ loading: false, error: message });
      return { success: false, error: message };
    }
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
    } catch (error) {
      console.error('Sign out error:', error);
      set({ loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
