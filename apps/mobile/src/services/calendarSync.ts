import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

const CALENDAR_NAME = 'IShift';
const CALENDAR_COLOR = '#4A9DAD';
const DEFAULT_SHIFT_HOURS = 8;

export async function requestCalendarPermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

// Thrown when the OS refuses to create a calendar under every source we
// try AND there is no writable calendar to fall back to. Callers map this
// to a user-facing "your account doesn't allow calendars" message instead
// of a bare native error string.
export const CALENDAR_ACCOUNT_READONLY = 'CALENDAR_ACCOUNT_READONLY';

async function createNamedCalendar(source: Calendar.Source | undefined): Promise<string> {
  return Calendar.createCalendarAsync({
    title: CALENDAR_NAME,
    color: CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: source?.id,
    source: source || {
      isLocalAccount: true,
      name: CALENDAR_NAME,
      type: Platform.OS === 'ios' ? Calendar.CalendarType.LOCAL : (undefined as any),
    },
    name: CALENDAR_NAME,
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

export async function getOrCreateShiftSnapCalendar(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

  // Look for existing ShiftSnap calendar
  const existing = calendars.find((cal) => cal.title === CALENDAR_NAME);
  if (existing) return existing.id;

  if (Platform.OS === 'ios') {
    // Some account sources (managed/Exchange/Google, or a read-only default)
    // reject createCalendarAsync with "該帳號不允許加入或移除行事曆". Try a
    // sequence of sources so a single unfriendly account doesn't sink the
    // whole feature.
    let defaultSource: Calendar.Source | undefined;
    try {
      const defaultCalendar = await Calendar.getDefaultCalendarAsync();
      defaultSource = defaultCalendar?.source;
    } catch {
      // getDefaultCalendarAsync itself can throw on locked-down accounts.
    }

    // Attempt 1: the default calendar's source (usually iCloud — allows it).
    if (defaultSource) {
      try {
        return await createNamedCalendar(defaultSource);
      } catch {
        // fall through
      }
    }

    // Attempt 2: force a local source, which sidesteps account restrictions.
    try {
      return await createNamedCalendar(undefined);
    } catch {
      // fall through
    }

    // Attempt 3: reuse any writable calendar so events still land somewhere
    // rather than failing outright.
    const writable = calendars.find((c) => c.allowsModifications);
    if (writable) return writable.id;

    throw new Error(CALENDAR_ACCOUNT_READONLY);
  }

  // Android
  return await createNamedCalendar(undefined);
}

export async function syncShiftToCalendar(
  shift: {
    id: string;
    date: string;
    shift_code: string;
    start_time: string | null;
    is_day_off: boolean;
    calendar_event_id: string | null;
  },
  codeInfo: { meaning: string; start_time: string | null; end_time: string | null } | undefined,
  calendarId: string
): Promise<string> {
  const title = codeInfo?.meaning
    ? `${codeInfo.meaning} (${shift.shift_code})`
    : `Shift ${shift.shift_code}`;

  const isAllDay = shift.is_day_off || !shift.start_time;

  let startDate: Date;
  let endDate: Date;

  if (isAllDay) {
    startDate = new Date(shift.date + 'T00:00:00');
    endDate = new Date(shift.date + 'T23:59:59');
  } else {
    const startTime = shift.start_time || codeInfo?.start_time || '09:00';
    startDate = new Date(`${shift.date}T${startTime}:00`);

    if (codeInfo?.end_time) {
      endDate = new Date(`${shift.date}T${codeInfo.end_time}:00`);
      // Handle overnight shifts
      if (endDate <= startDate) {
        endDate.setDate(endDate.getDate() + 1);
      }
    } else {
      endDate = new Date(startDate.getTime() + DEFAULT_SHIFT_HOURS * 60 * 60 * 1000);
    }
  }

  const eventDetails: Omit<Partial<Calendar.Event>, 'id'> = {
    title,
    startDate,
    endDate,
    allDay: isAllDay,
    calendarId,
    notes: `IShift - ${shift.shift_code}`,
  };

  // Update existing event or create new one
  if (shift.calendar_event_id) {
    try {
      await Calendar.updateEventAsync(shift.calendar_event_id, eventDetails);
      return shift.calendar_event_id;
    } catch {
      // Event may have been deleted, create new one
    }
  }

  const eventId = await Calendar.createEventAsync(calendarId, eventDetails);
  return eventId;
}

export async function removeShiftFromCalendar(eventId: string): Promise<void> {
  try {
    await Calendar.deleteEventAsync(eventId);
  } catch {
    // Event may already be deleted
  }
}

export async function syncAllShifts(
  shifts: Array<{
    id: string;
    date: string;
    shift_code: string;
    start_time: string | null;
    is_day_off: boolean;
    calendar_event_id: string | null;
  }>,
  shiftCodes: Array<{ code: string; meaning: string; start_time: string | null; end_time: string | null }>,
  calendarId: string
): Promise<Map<string, string>> {
  const syncResults = new Map<string, string>();

  for (const shift of shifts) {
    const codeInfo = shiftCodes.find((sc) => sc.code === shift.shift_code);
    try {
      const eventId = await syncShiftToCalendar(shift, codeInfo, calendarId);
      syncResults.set(shift.id, eventId);
    } catch (error) {
      console.error(`Failed to sync shift ${shift.id}:`, error);
    }
  }

  return syncResults;
}
