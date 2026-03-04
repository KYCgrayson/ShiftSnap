import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

const CALENDAR_NAME = 'IShift';
const CALENDAR_COLOR = '#4A9DAD';
const DEFAULT_SHIFT_HOURS = 8;

export async function requestCalendarPermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

export async function getOrCreateShiftSnapCalendar(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

  // Look for existing ShiftSnap calendar
  const existing = calendars.find((cal) => cal.title === CALENDAR_NAME);
  if (existing) return existing.id;

  // Create new calendar
  let defaultCalendarSource: Calendar.Source | undefined;

  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    defaultCalendarSource = defaultCalendar?.source;
  }

  const calendarId = await Calendar.createCalendarAsync({
    title: CALENDAR_NAME,
    color: CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: defaultCalendarSource?.id,
    source: defaultCalendarSource || {
      isLocalAccount: true,
      name: CALENDAR_NAME,
      type: Platform.OS === 'ios' ? Calendar.CalendarType.LOCAL : undefined as any,
    },
    name: CALENDAR_NAME,
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });

  return calendarId;
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
