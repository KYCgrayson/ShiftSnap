// User types
export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  locale: Locale;
  timezone: string;
  default_alarm_minutes: number;
  created_at: string;
}

export type Locale = 'en' | 'zh-TW' | 'zh-CN' | 'ja';

// Person types (for multi-person schedule tracking)
export interface Person {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
}

// Schedule sharing types
export interface ScheduleSharing {
  id: string;
  from_user_id: string;
  to_user_id: string | null;
  invite_code: string;
  invite_url: string;
  status: ShareStatus;
  color: string | null;
  nickname: string | null;
  is_visible: boolean;
  accepted_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export type ShareStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

// Group types
export interface Group {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  settings: GroupSettings;
  created_at: string;
}

export interface GroupSettings {
  default_shift_codes?: ShiftCodeDefinition[];
  timezone?: string;
}

// Group member types
export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupRole;
  nickname: string | null;
  color: string | null;
  is_visible: boolean;
  joined_at: string;
}

export type GroupRole = 'member' | 'site_manager' | 'admin';

// Schedule types
export interface Schedule {
  id: string;
  owner_id: string;
  person_id: string | null;
  group_id: string | null;
  image_url: string;
  year_month: string; // Format: 2026-02
  raw_ocr_result: OCRResult | null;
  status: ScheduleStatus;
  created_at: string;
}

export type ScheduleStatus = 'draft' | 'published' | 'archived';

// Shift types
export interface Shift {
  id: string;
  schedule_id: string;
  user_id: string;
  person_id: string | null;
  date: string; // ISO date string
  shift_code: string;
  start_time: string | null; // HH:MM format
  end_time: string | null; // HH:MM format
  is_day_off: boolean;
  source: ShiftSource;
  comparison_status: ComparisonStatus;
  paired_shift_id: string | null;
  calendar_event_id: string | null;
  synced_at: string | null;
}

export type ShiftSource = 'self_scan' | 'manager_distributed';
export type ComparisonStatus = 'pending' | 'matched' | 'discrepancy' | 'resolved';

// Shift code types
export interface ShiftCode {
  id: string;
  user_id: string;
  person_id: string | null;
  group_id: string | null;
  code: string;
  meaning: string;
  start_time: string | null; // HH:MM format
  end_time: string | null; // HH:MM format
  is_day_off: boolean;
  is_confirmed: boolean;
  is_group_shared: boolean;
  created_at: string;
}

export interface ShiftCodeDefinition {
  code: string;
  meaning: string;
  start_time: string | null;
  end_time: string | null;
  is_day_off: boolean;
}

// OCR Result types
export interface OCRResult {
  success: boolean;
  confidence: number;
  detected_month: string | null;
  detected_year: number | null;
  rows: OCRRow[];
  unknown_codes: string[];
  raw_response?: string;
}

export interface OCRRow {
  name: string | null;
  shifts: OCRShift[];
}

export interface OCRShift {
  date: number; // Day of month
  code: string;
  confidence: number;
}

// Calendar event types
export interface CalendarEvent {
  id: string;
  title: string;
  start_time: Date;
  end_time: Date | null;
  all_day: boolean;
  color: string;
  person_name: string | null;
  shift_code: string;
  source_image_url: string | null;
}

// API Response types
export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Auth types
export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// Navigation types
export type RootStackParamList = {
  Auth: undefined;
  Login: undefined;
  Register: undefined;
  Main: undefined;
  Home: undefined;
  Scan: undefined;
  ScanResult: { scheduleId: string };
  Calendar: undefined;
  Settings: undefined;
  Profile: undefined;
  ShiftCodes: undefined;
  Persons: undefined;
  PersonDetail: { personId: string };
};
