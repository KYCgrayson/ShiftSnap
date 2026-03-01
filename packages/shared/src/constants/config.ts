/**
 * ShiftSnap Configuration Constants
 */

// App info
export const APP_NAME = 'ShiftSnap';
export const APP_VERSION = '1.0.0';
export const APP_BUNDLE_ID = 'com.shiftsnap.app';

// Default values
export const DEFAULT_LOCALE = 'en';
export const DEFAULT_TIMEZONE = 'Asia/Taipei';
export const DEFAULT_ALARM_MINUTES = 60;

// Supported locales (only include locales with complete translations)
export const SUPPORTED_LOCALES = ['en', 'zh-TW'] as const;

// Locale display names
export const LOCALE_NAMES: Record<string, string> = {
  'en': 'English',
  'zh-TW': '繁體中文',
};

// Alarm options (minutes before shift)
export const ALARM_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
] as const;

// Schedule sharing
export const INVITE_EXPIRY_DAYS = 7;
export const INVITE_CODE_LENGTH = 8;

// Group invite
export const GROUP_INVITE_CODE_LENGTH = 6;

// Image upload
export const MAX_IMAGE_SIZE_MB = 10;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

// OCR settings
export const OCR_MIN_CONFIDENCE = 0.7;

// Calendar sync
export const CALENDAR_SYNC_BATCH_SIZE = 50;

// Common shift codes (pre-defined suggestions)
export const COMMON_SHIFT_CODES = [
  { code: 'A', meaning: 'Morning shift', start_time: '06:00', end_time: '14:00', is_day_off: false },
  { code: 'B', meaning: 'Afternoon shift', start_time: '14:00', end_time: '22:00', is_day_off: false },
  { code: 'C', meaning: 'Night shift', start_time: '22:00', end_time: '06:00', is_day_off: false },
  { code: 'D', meaning: 'Day shift', start_time: '09:00', end_time: '17:00', is_day_off: false },
  { code: '/', meaning: 'Day off', start_time: null, end_time: null, is_day_off: true },
  { code: 'X', meaning: 'Day off', start_time: null, end_time: null, is_day_off: true },
  { code: 'OFF', meaning: 'Day off', start_time: null, end_time: null, is_day_off: true },
  { code: 'O', meaning: 'Day off', start_time: null, end_time: null, is_day_off: true },
  { code: 'V', meaning: 'Vacation', start_time: null, end_time: null, is_day_off: true },
  { code: 'H', meaning: 'Holiday', start_time: null, end_time: null, is_day_off: true },
  { code: '小年', meaning: 'Little New Year', start_time: null, end_time: null, is_day_off: true },
  { code: '除夕', meaning: "New Year's Eve", start_time: null, end_time: null, is_day_off: true },
  { code: '初一', meaning: 'CNY Day 1', start_time: null, end_time: null, is_day_off: true },
  { code: '初二', meaning: 'CNY Day 2', start_time: null, end_time: null, is_day_off: true },
  { code: '初三', meaning: 'CNY Day 3', start_time: null, end_time: null, is_day_off: true },
  { code: '初四', meaning: 'CNY Day 4', start_time: null, end_time: null, is_day_off: true },
  { code: '初五', meaning: 'CNY Day 5', start_time: null, end_time: null, is_day_off: true },
  { code: '初六', meaning: 'CNY Day 6', start_time: null, end_time: null, is_day_off: true },
] as const;

// Supabase storage buckets
export const STORAGE_BUCKETS = {
  SCHEDULE_IMAGES: 'shift-images',
  AVATARS: 'avatars',
} as const;

// API endpoints (relative paths)
export const API_ENDPOINTS = {
  OCR_PROCESS: '/functions/v1/ocr-process',
  CALENDAR_SYNC: '/functions/v1/calendar-sync',
} as const;

// External links
export const EXTERNAL_LINKS = {
  PRIVACY_POLICY: 'https://shiftsnap.app/privacy',
  TERMS_OF_SERVICE: 'https://shiftsnap.app/terms',
  SUPPORT: 'https://shiftsnap.app/support',
  FEEDBACK: 'https://shiftsnap.app/feedback',
} as const;
