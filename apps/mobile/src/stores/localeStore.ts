import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceLocale, isSupportedLocale } from '../i18n/deviceLocale';
import i18n from '../i18n';

const LOCALE_STORAGE_KEY = 'shiftsnap_locale';

interface LocaleState {
  locale: string;
  initialized: boolean;

  initialize: () => Promise<void>;
  setLocale: (locale: string) => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: getDeviceLocale(),
  initialized: false,

  initialize: async () => {
    let locale = getDeviceLocale();
    try {
      const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && isSupportedLocale(stored)) locale = stored;
    } catch {
      // A missing preference follows the device language.
    }
    await i18n.changeLanguage(locale);
    set({ locale, initialized: true });
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
