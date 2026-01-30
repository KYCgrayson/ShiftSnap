/**
 * ShiftSnap Spacing System
 * Based on 4px grid
 */

// Base spacing unit
export const SPACING_UNIT = 4;

// Spacing scale
export const Spacing = {
  none: 0,
  xxs: SPACING_UNIT, // 4
  xs: SPACING_UNIT * 2, // 8
  sm: SPACING_UNIT * 3, // 12
  md: SPACING_UNIT * 4, // 16
  lg: SPACING_UNIT * 5, // 20
  xl: SPACING_UNIT * 6, // 24
  xxl: SPACING_UNIT * 8, // 32
  xxxl: SPACING_UNIT * 10, // 40
  huge: SPACING_UNIT * 12, // 48
  massive: SPACING_UNIT * 16, // 64
} as const;

// Border radius (all UI must have rounded corners)
export const BorderRadius = {
  none: 0,
  xs: 4,
  sm: 8, // Calendar date cells
  md: 12, // Regular buttons, input fields
  lg: 16, // Cards
  xl: 20, // Pills, tags (capsule shape)
  xxl: 24, // Modals, bottom sheets (top corners)
  full: 9999, // Circular (avatars, toggle switches)
} as const;

// Input field dimensions
export const InputSize = {
  height: 48,
  heightLarge: 52,
  paddingHorizontal: Spacing.md,
  paddingVertical: 14,
  borderRadius: BorderRadius.md,
  borderWidth: 1,
} as const;

// Button dimensions
export const ButtonSize = {
  heightPrimary: 48,
  heightSecondary: 40,
  heightSmall: 32,
  paddingHorizontal: Spacing.xl,
  paddingHorizontalSmall: Spacing.md,
  borderRadius: BorderRadius.md,
  borderRadiusPill: BorderRadius.full,
} as const;

// Card dimensions
export const CardSize = {
  padding: Spacing.lg,
  paddingLarge: Spacing.xl,
  borderRadius: BorderRadius.lg,
  borderWidth: 1,
} as const;

// Icon sizes
export const IconSize = {
  xs: 16, // Indicators
  sm: 20, // Inline
  md: 24, // Navigation, default
  lg: 28,
  xl: 32,
  xxl: 48,
} as const;

// Screen padding
export const ScreenPadding = {
  horizontal: Spacing.md,
  vertical: Spacing.md,
  bottom: Spacing.xxl, // Extra space for bottom navigation
} as const;

// Animation durations (ms)
export const Duration = {
  instant: 100,
  fast: 150,
  normal: 200,
  slow: 300,
  verySlow: 500,
} as const;

// Common shadow styles
export const Shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

// Z-index layers
export const ZIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 70,
} as const;
