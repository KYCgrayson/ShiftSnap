/**
 * ShiftSnap Theme Provider
 * Combines colors, typography, and spacing from shared package
 */

import { useColorScheme } from 'react-native';
import { Colors, DarkColors, Gradients, PersonColors } from '@shiftsnap/shared';
import { FontSize, FontWeight, TextStyles } from '@shiftsnap/shared';
import { Spacing, BorderRadius, Shadows, InputSize, ButtonSize, CardSize, IconSize } from '@shiftsnap/shared';
import { useThemeStore } from '../stores/themeStore';

export type AppColors = {
  [K in keyof typeof Colors | keyof typeof DarkColors]: string;
};

export interface Theme {
  colors: AppColors;
  gradients: typeof Gradients;
  personColors: typeof PersonColors;
  fonts: {
    sizes: typeof FontSize;
    weights: typeof FontWeight;
    styles: typeof TextStyles;
  };
  spacing: typeof Spacing;
  borderRadius: typeof BorderRadius;
  shadows: typeof Shadows;
  inputs: typeof InputSize;
  buttons: typeof ButtonSize;
  cards: typeof CardSize;
  icons: typeof IconSize;
  isDark: boolean;
}

export const lightTheme: Theme = {
  colors: Colors,
  gradients: Gradients,
  personColors: PersonColors,
  fonts: {
    sizes: FontSize,
    weights: FontWeight,
    styles: TextStyles,
  },
  spacing: Spacing,
  borderRadius: BorderRadius,
  shadows: Shadows,
  inputs: InputSize,
  buttons: ButtonSize,
  cards: CardSize,
  icons: IconSize,
  isDark: false,
};

export const darkTheme: Theme = {
  colors: DarkColors as any,
  gradients: Gradients,
  personColors: PersonColors,
  fonts: {
    sizes: FontSize,
    weights: FontWeight,
    styles: TextStyles,
  },
  spacing: Spacing,
  borderRadius: BorderRadius,
  shadows: Shadows,
  inputs: InputSize,
  buttons: ButtonSize,
  cards: CardSize,
  icons: IconSize,
  isDark: true,
};

// Hook to get current theme based on user preference or system
export function useTheme(): Theme {
  const systemColorScheme = useColorScheme();
  const themeMode = useThemeStore((state) => state.mode);

  let isDark: boolean;
  if (themeMode === 'system') {
    isDark = systemColorScheme === 'dark';
  } else {
    isDark = themeMode === 'dark';
  }

  return isDark ? darkTheme : lightTheme;
}

// Re-export for convenience
export { Colors, DarkColors, Gradients, PersonColors };
export { FontSize, FontWeight, TextStyles };
export { Spacing, BorderRadius, Shadows, InputSize, ButtonSize, CardSize, IconSize };
