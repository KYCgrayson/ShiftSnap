import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@shiftsnap/shared';

import en from './locales/en';
import zhTW from './locales/zh-TW';

const resources = {
  en: { translation: en },
  'zh-TW': { translation: zhTW },
};

// Detect device locale and match to a supported locale
function getDeviceLocale(): string {
  const deviceLocales = Localization.getLocales();
  if (!deviceLocales || deviceLocales.length === 0) return DEFAULT_LOCALE;

  for (const loc of deviceLocales) {
    // Check exact match first (e.g. zh-TW)
    const tag = loc.languageTag;
    if ((SUPPORTED_LOCALES as readonly string[]).includes(tag)) {
      return tag;
    }
    // Check language-region combo (e.g. zh-Hant-TW → zh-TW)
    if (loc.languageCode === 'zh') {
      if (loc.regionCode === 'TW' || loc.regionCode === 'HK') {
        return 'zh-TW';
      }
      // Also match Hant script via languageTag (e.g. "zh-Hant-TW", "zh-Hant")
      if (tag.includes('Hant')) {
        return 'zh-TW';
      }
      if (loc.regionCode === 'CN' || tag.includes('Hans')) {
        return 'zh-CN';
      }
    }
    // Check language-only match
    if ((SUPPORTED_LOCALES as readonly string[]).includes(loc.languageCode ?? '')) {
      return loc.languageCode!;
    }
  }

  return DEFAULT_LOCALE;
}

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLocale(),
  fallbackLng: DEFAULT_LOCALE,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
