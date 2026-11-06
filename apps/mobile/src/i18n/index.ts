import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE } from '@shiftsnap/shared';
import { getDeviceLocale } from './deviceLocale';

import en from './locales/en';
import zhTW from './locales/zh-TW';

const resources = {
  en: { translation: en },
  'zh-TW': { translation: zhTW },
};

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
