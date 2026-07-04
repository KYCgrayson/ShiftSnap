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

async function createNamedCalendarWithSource(source: Calendar.Source): Promise<string> {
  // iOS keys off sourceId; the source object is passed too so Android and
  // older iOS paths both resolve the owning account.
  return Calendar.createCalendarAsync({
    title: CALENDAR_NAME,
    color: CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: source.id,
    source,
    name: CALENDAR_NAME,
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

// Build the iOS source-try order. Creating a calendar needs an EKSource that
// permits it: iCloud (CalDAV) syncs across devices and usually allows it, a
// LOCAL source is on-device but always writable, and read-only sources
// (Subscribed / Birthdays) are skipped entirely. We try REAL sources by id —
// a synthesized source object is rejected by iOS ("must match an account on
// the device... or the OS will delete the calendar").
async function getIosCandidateSources(): Promise<Calendar.Source[]> {
  const ordered: Calendar.Source[] = [];
  const push = (s?: Calendar.Source) => {
    if (s?.id) ordered.push(s);
  };

  try {
    const sources = await Calendar.getSourcesAsync();
    const isType = (s: Calendar.Source, t: Calendar.SourceType) => s.type === t;
    // iCloud first (cross-device), then reliable on-device LOCAL, then any
    // other source that isn't obviously read-only.
    sources.filter((s) => isType(s, Calendar.SourceType.CALDAV)).forEach(push);
    sources.filter((s) => isType(s, Calendar.SourceType.LOCAL)).forEach(push);
    sources
      .filter(
        (s) =>
          !isType(s, Calendar.SourceType.CALDAV) &&
          !isType(s, Calendar.SourceType.LOCAL) &&
          !isType(s, Calendar.SourceType.SUBSCRIBED) &&
          !isType(s, Calendar.SourceType.BIRTHDAYS),
      )
      .forEach(push);
  } catch {
    // getSourcesAsync can throw on locked-down devices — fall through to the
    // default-calendar source below.
  }

  // Always also consider the default calendar's own source as a candidate.
  try {
    const def = await Calendar.getDefaultCalendarAsync();
    push(def?.source);
  } catch {
    // ignore
  }

  return ordered;
}

export async function getOrCreateShiftSnapCalendar(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

  // Look for existing ShiftSnap calendar
  const existing = calendars.find((cal) => cal.title === CALENDAR_NAME);
  if (existing) return existing.id;

  if (Platform.OS === 'ios') {
    const candidates = await getIosCandidateSources();
    const seen = new Set<string>();
    for (const src of candidates) {
      if (!src.id || seen.has(src.id)) continue;
      seen.add(src.id);
      try {
        return await createNamedCalendarWithSource(src);
      } catch {
        // This source rejected creation — try the next one.
      }
    }

    // Last resort: reuse an existing writable calendar so events still land
    // somewhere rather than failing outright. Intrusive (mixes into a
    // personal calendar), only reached when no source accepts a new calendar.
    const writable = calendars.find((c) => c.allowsModifications);
    if (writable) return writable.id;

    throw new Error(CALENDAR_ACCOUNT_READONLY);
  }

  // Android: a synthesized local account is the expected pattern here.
  return Calendar.createCalendarAsync({
    title: CALENDAR_NAME,
    color: CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    source: {
      isLocalAccount: true,
      name: CALENDAR_NAME,
      type: undefined as any,
    },
    name: CALENDAR_NAME,
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
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
