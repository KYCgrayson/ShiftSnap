import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LOCALE } from '@shiftsnap/shared';

const LOCALE_STORAGE_KEY = 'shiftsnap_locale';

interface LocaleState {
  locale: string;
  initialized: boolean;

  initialize: () => Promise<void>;
  setLocale: (locale: string) => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: DEFAULT_LOCALE,
  initialized: false,

  initialize: async () => {
    try {
      const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored) {
        set({ locale: stored, initialized: true });
      } else {
        set({ initialized: true });
      }
    } catch {
      set({ initialized: true });
    }
  },

  setLocale: async (locale: string) => {
    set({ locale });
    try {
      await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Silently fail
    }
  },
}));
