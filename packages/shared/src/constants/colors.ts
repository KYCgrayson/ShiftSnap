/**
 * ShiftSnap Color System
 * Design Philosophy: Fresh, Modern, Warm & Inviting
 */

// Primary Palette
export const Colors = {
  // Primary colors
  primary: '#4A9DAD',
  primaryLight: '#6BC4D0',
  primaryDark: '#357A87',

  // Secondary / Accent
  secondary: '#F5A962',
  secondaryLight: '#F7C488',

  // Backgrounds
  warmWhite: '#FFFBF7',
  softCream: '#FFF5EB',
  softGray: '#F7F4F1',
  background: '#FFFBF7',
  backgroundElevated: '#FFFFFF',
  surface: '#FFF5EB',

  // Text
  textPrimary: '#3D3D3D',
  textSecondary: '#7A7A7A',
  textMuted: '#A0A0A0',

  // Semantic colors
  success: '#5EBD8A',
  warning: '#F5A962',
  error: '#E87B7B',

  // Borders & Dividers
  border: '#E8E4E0',
  borderLight: '#F0EDE9',
  borderFocus: '#4A9DAD',

  // Card & Surface
  cardBackground: '#FFFFFF',
  cardHover: '#FFFBF7',

  // Pure colors
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// Dark Mode Colors
export const DarkColors = {
  // Primary colors (slightly brighter for contrast)
  primary: '#5BB5C2',
  primaryLight: '#7ACBD6',
  primaryDark: '#4A9DAD',

  // Secondary / Accent
  secondary: '#F5A962',
  secondaryLight: '#F7C488',

  // Backgrounds
  warmWhite: '#1A1B1E',
  softCream: '#252528',
  softGray: '#2C2C2E',
  background: '#1A1B1E',
  backgroundElevated: '#2C2C2E',
  surface: '#252528',

  // Text
  textPrimary: '#F5F5F5',
  textSecondary: '#A0A0A0',
  textMuted: '#6B6B6B',

  // Semantic colors
  success: '#6ECF9A',
  warning: '#F5A962',
  error: '#EF9A9A',

  // Borders & Dividers
  border: '#3A3A3C',
  borderLight: '#2C2C2E',
  borderFocus: '#5BB5C2',

  // Card & Surface
  cardBackground: '#2C2C2E',
  cardHover: '#353538',

  // Pure colors
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// Person Colors for Calendar (with gradient pairs)
export const PersonColors = [
  { name: 'Coral', hex: '#FF8A80', gradient: ['#FF8A80', '#FFAB91'] },
  { name: 'Teal', hex: '#4DD0C4', gradient: ['#4DD0C4', '#80DEEA'] },
  { name: 'Gold', hex: '#FFD54F', gradient: ['#FFD54F', '#FFE082'] },
  { name: 'Lavender', hex: '#B39DDB', gradient: ['#B39DDB', '#CE93D8'] },
  { name: 'Sky Blue', hex: '#81D4FA', gradient: ['#81D4FA', '#B3E5FC'] },
  { name: 'Peach', hex: '#FFAB91', gradient: ['#FFAB91', '#FFCCBC'] },
  { name: 'Mint', hex: '#80CBC4', gradient: ['#80CBC4', '#A7FFEB'] },
  { name: 'Rose', hex: '#F48FB1', gradient: ['#F48FB1', '#F8BBD9'] },
] as const;

// Gradients
export const Gradients = {
  primary: ['#4A9DAD', '#6BC4D0'],
  warm: ['#F5A962', '#F7C488'],
  softBackground: ['#FFFBF7', '#FFF5EB'],
  calendarToday: ['#E8F6F8', '#FFFFFF'],
  cardHover: ['#FFFFFF', '#FFF9F3'],
  danger: ['#E87B7B', '#EF9A9A'],
} as const;

// Get next available person color
export function getNextPersonColor(usedColors: string[]): typeof PersonColors[number] {
  const available = PersonColors.filter(c => !usedColors.includes(c.hex));
  if (available.length > 0) {
    return available[0];
  }
  // If all colors are used, return the first one
  return PersonColors[0];
}

export type ColorScheme = typeof Colors;
export type DarkColorScheme = typeof DarkColors;
