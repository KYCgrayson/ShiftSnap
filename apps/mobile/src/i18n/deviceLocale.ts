import * as Localization from 'expo-localization';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@shiftsnap/shared';

export function isSupportedLocale(locale: string): boolean {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

export function getDeviceLocale(): string {
  for (const locale of Localization.getLocales()) {
    if (isSupportedLocale(locale.languageTag)) return locale.languageTag;
    if (locale.languageCode === 'zh' && (
      locale.regionCode === 'TW'
      || locale.regionCode === 'HK'
      || locale.regionCode === 'MO'
      || locale.languageTag.includes('Hant')
    )) {
      return 'zh-TW';
    }
    if (locale.languageCode && isSupportedLocale(locale.languageCode)) return locale.languageCode;
  }
  return DEFAULT_LOCALE;
}
