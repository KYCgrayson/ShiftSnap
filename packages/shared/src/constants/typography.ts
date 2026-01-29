/**
 * ShiftSnap Typography System
 *
 * iOS: SF Pro Rounded (headers), SF Pro Text (body)
 * Android: Nunito (headers), Inter (body)
 * CJK: Noto Sans CJK TC
 */

import { Platform } from 'react-native';

// Font families based on platform
export const FontFamily = {
  // Headers
  displayIOS: 'SF Pro Rounded',
  displayAndroid: 'Nunito',
  display: Platform?.OS === 'ios' ? 'SF Pro Rounded' : 'Nunito',

  // Body text
  bodyIOS: 'SF Pro Text',
  bodyAndroid: 'Inter',
  body: Platform?.OS === 'ios' ? 'SF Pro Text' : 'Inter',

  // CJK support
  cjk: 'Noto Sans CJK TC',

  // Fallback
  system: Platform?.OS === 'ios' ? 'System' : 'Roboto',
} as const;

// Font sizes
export const FontSize = {
  displayHero: 40,
  displayLarge: 32,
  h1: 28,
  h2: 24,
  h3: 22,
  h4: 20,
  bodyLarge: 17,
  body: 16,
  bodySmall: 15,
  caption: 14,
  captionSmall: 13,
  tiny: 12,
  button: 16,
} as const;

// Font weights
export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Line heights
export const LineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.75,
};

// Letter spacing
export const LetterSpacing = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
};

// Pre-defined text styles
export const TextStyles = {
  displayHero: {
    fontSize: FontSize.displayHero,
    fontWeight: FontWeight.bold,
    lineHeight: FontSize.displayHero * LineHeight.tight,
  },
  displayLarge: {
    fontSize: FontSize.displayLarge,
    fontWeight: FontWeight.bold,
    lineHeight: FontSize.displayLarge * LineHeight.tight,
  },
  h1: {
    fontSize: FontSize.h1,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.h1 * LineHeight.tight,
  },
  h2: {
    fontSize: FontSize.h2,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.h2 * LineHeight.tight,
  },
  h3: {
    fontSize: FontSize.h3,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.h3 * LineHeight.normal,
  },
  h4: {
    fontSize: FontSize.h4,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.h4 * LineHeight.normal,
  },
  bodyLarge: {
    fontSize: FontSize.bodyLarge,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.bodyLarge * LineHeight.normal,
  },
  body: {
    fontSize: FontSize.body,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.body * LineHeight.normal,
  },
  bodySmall: {
    fontSize: FontSize.bodySmall,
    fontWeight: FontWeight.regular,
    lineHeight: FontSize.bodySmall * LineHeight.normal,
  },
  caption: {
    fontSize: FontSize.caption,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.caption * LineHeight.normal,
  },
  captionSmall: {
    fontSize: FontSize.captionSmall,
    fontWeight: FontWeight.medium,
    lineHeight: FontSize.captionSmall * LineHeight.normal,
  },
  button: {
    fontSize: FontSize.button,
    fontWeight: FontWeight.semibold,
    lineHeight: FontSize.button * LineHeight.tight,
  },
} as const;
