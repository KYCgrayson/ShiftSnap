import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import {
  supabase,
  signInWithEmail,
  signUpWithEmail,
  signOut as supabaseSignOut,
  getCurrentSession,
} from '../services/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,
  error: null,

  initialize: async () => {
    try {
      set({ loading: true });

      // Get current session
      const { session, error } = await getCurrentSession();

      if (error) {
        console.error('Error getting session:', error);
        set({ user: null, session: null, initialized: true, loading: false });
        return;
      }

      if (session) {
        set({
          user: session.user,
          session,
          initialized: true,
          loading: false,
        });
      } else {
        set({ user: null, session: null, initialized: true, loading: false });
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

  signOut: async () => {
    set({ loading: true });

    try {
      await supabaseSignOut();
      set({ user: null, session: null, loading: false, error: null });
    } catch (error) {
      console.error('Sign out error:', error);
      set({ loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
