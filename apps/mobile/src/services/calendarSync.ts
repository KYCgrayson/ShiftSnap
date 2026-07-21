import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

const CALENDAR_NAME = 'IShift';
const CALENDAR_COLOR = '#4A9DAD';
const DEFAULT_SHIFT_HOURS = 8;
const SYNC_KEY_PREFIX = 'IShift:v2';
const SYNC_KEY_NOTE_LABEL = 'IShift-Sync-Key';

export interface CalendarShiftForSync {
  id: string;
  schedule_id?: string;
  user_id: string;
  person_id?: string | null;
  name_on_schedule?: string | null;
  date: string;
  shift_code: string;
  start_time: string | null;
  end_time?: string | null;
  is_day_off: boolean;
  source?: string | null;
  calendar_event_id: string | null;
}

export interface CalendarShiftCodeForSync {
  code?: string;
  meaning: string;
  start_time: string | null;
  end_time: string | null;
  is_day_off?: boolean;
}

export interface CalendarSyncDateRange {
  startDate?: string;
  endDate?: string;
  userId?: string;
  alarmMinutes?: number | null;
}

export interface CalendarSyncResult {
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  eventIdsByShiftId: Map<string, string>;
}

export interface CalendarRemovalResult {
  deleted: number;
  failed: number;
}

export interface WritableCalendarDestination {
  id: string;
  title: string;
  sourceName?: string;
}

export async function requestCalendarPermissions(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

export async function getWritableCalendars(): Promise<WritableCalendarDestination[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.filter((calendar) => calendar.allowsModifications).map((calendar) => ({ id: calendar.id, title: calendar.title || calendar.name || CALENDAR_NAME, sourceName: calendar.source?.name || calendar.ownerAccount || undefined }));
}

export async function isWritableCalendar(calendarId: string): Promise<boolean> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.some((calendar) => calendar.id === calendarId && calendar.allowsModifications);
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
  const existing = calendars.find((cal) => cal.title === CALENDAR_NAME && cal.allowsModifications);
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

function parseISODate(date: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function startOfLocalDate(date: string): Date {
  const parsed = parseISODate(date);
  if (!parsed) return new Date(`${date}T00:00:00`);
  return new Date(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0);
}

function endOfLocalDate(date: string): Date {
  const end = startOfLocalDate(date);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTime(time?: string | null): string | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dateAtLocalTime(date: string, time: string): Date {
  const parsed = parseISODate(date);
  const [hour, minute] = time.split(':').map(Number);
  if (!parsed) return new Date(`${date}T${time}:00`);
  return new Date(parsed.year, parsed.month - 1, parsed.day, hour, minute, 0, 0);
}

function getShiftSyncKey(shift: Pick<CalendarShiftForSync, 'id' | 'user_id'>, syncOwnerUserId?: string): string {
  return `${SYNC_KEY_PREFIX}:${syncOwnerUserId || shift.user_id}:${shift.id}`;
}

function getEventSyncKey(event: Calendar.Event): string | null {
  const notes = event.notes || '';
  const match = new RegExp(`${SYNC_KEY_NOTE_LABEL}:\\s*(IShift:v\\d+:[^\\s]+)`).exec(notes);
  return match?.[1] || null;
}

function getUserIdFromSyncKey(syncKey: string): string | null {
  const parts = syncKey.split(':');
  return parts.length >= 4 && parts[0] === 'IShift' && /^v\\d+$/.test(parts[1])
    ? parts[2]
    : null;
}

function isIShiftSyncKey(syncKey: string): boolean {
  return /^IShift:v\\d+:/.test(syncKey);
}

function isIShiftManagedEvent(event: Calendar.Event): boolean {
  const notes = event.notes || '';
  return notes.includes(`${SYNC_KEY_NOTE_LABEL}:`) || notes.trim().startsWith('IShift -');
}

function getEventLocalStartDate(event: Calendar.Event): string | null {
  const raw = event.startDate;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return formatLocalDate(date);
}

function buildEventDetails(
  shift: CalendarShiftForSync,
  codeInfo: CalendarShiftCodeForSync | undefined,
  calendarId: string,
  alarmMinutes?: number | null,
  syncOwnerUserId?: string,
): Omit<Partial<Calendar.Event>, 'id'> {
  const shiftTitle = codeInfo?.meaning
    ? `${codeInfo.meaning} (${shift.shift_code})`
    : `Shift ${shift.shift_code}`;
  const rowName = shift.name_on_schedule?.trim();
  const title = rowName ? `${rowName} · ${shiftTitle}` : shiftTitle;

  const startTime = normalizeTime(shift.start_time) || normalizeTime(codeInfo?.start_time);
  const endTime = normalizeTime(shift.end_time) || normalizeTime(codeInfo?.end_time);
  const isAllDay = shift.is_day_off || codeInfo?.is_day_off || !startTime;

  let startDate: Date;
  let endDate: Date;

  if (isAllDay) {
    startDate = startOfLocalDate(shift.date);
    endDate = endOfLocalDate(shift.date);
  } else {
    startDate = dateAtLocalTime(shift.date, startTime || '09:00');

    if (endTime) {
      endDate = dateAtLocalTime(shift.date, endTime);
      // Handle overnight shifts
      if (endDate <= startDate) {
        endDate.setDate(endDate.getDate() + 1);
      }
    } else {
      endDate = new Date(startDate.getTime() + DEFAULT_SHIFT_HOURS * 60 * 60 * 1000);
    }
  }

  const syncKey = getShiftSyncKey(shift, syncOwnerUserId);
  const shouldAddAlarm =
    alarmMinutes !== null &&
    alarmMinutes !== undefined &&
    Number.isFinite(alarmMinutes) &&
    alarmMinutes > 0 &&
    !isAllDay;

  return {
    title,
    startDate,
    endDate,
    allDay: isAllDay,
    calendarId,
    alarms: shouldAddAlarm ? [{ relativeOffset: -alarmMinutes }] : [],
    notes: `IShift - ${shift.shift_code}\n${SYNC_KEY_NOTE_LABEL}: ${syncKey}`,
  };
}

function getReconcileRange(
  shifts: CalendarShiftForSync[],
  range?: CalendarSyncDateRange,
): { start: Date; end: Date } | null {
  if (range?.startDate && range?.endDate) {
    return {
      start: startOfLocalDate(range.startDate),
      // Query through the following day so overnight shifts ending after
      // midnight are visible to de-duplication.
      end: addDays(endOfLocalDate(range.endDate), 1),
    };
  }

  if (shifts.length === 0) return null;

  const sortedDates = shifts.map((s) => s.date).sort();
  return {
    start: startOfLocalDate(sortedDates[0]),
    end: addDays(endOfLocalDate(sortedDates[sortedDates.length - 1]), 1),
  };
}

async function deleteManagedEvent(event: Calendar.Event): Promise<boolean> {
  if (!isIShiftManagedEvent(event)) return false;
  try {
    await Calendar.deleteEventAsync(event.id);
    return true;
  } catch {
    return false;
  }
}

export async function syncShiftToCalendar(
  shift: CalendarShiftForSync,
  codeInfo: CalendarShiftCodeForSync | undefined,
  calendarId: string,
  alarmMinutes?: number | null,
): Promise<string> {
  const shiftCodes = codeInfo
    ? [{ ...codeInfo, code: codeInfo.code ?? shift.shift_code }]
    : [];
  const result = await reconcileShiftsToCalendar([shift], shiftCodes, calendarId, {
    startDate: shift.date,
    endDate: shift.date,
    userId: shift.user_id,
    alarmMinutes,
  });
  const eventId = result.eventIdsByShiftId.get(shift.id);
  if (!eventId) {
    throw new Error('Failed to sync shift to calendar');
  }
  return eventId;
}

export async function removeShiftFromCalendar(eventId: string): Promise<void> {
  try {
    await Calendar.deleteEventAsync(eventId);
  } catch {
    // Event may already be deleted
  }
}

// Remove only events that carry an ownership key for the selected account.
// Unkeyed legacy events are deliberately left untouched: on shared devices we
// cannot safely establish which account created them.
export async function removeManagedEventsForUser(
  calendarId: string,
  userId: string,
  range: Required<Pick<CalendarSyncDateRange, 'startDate' | 'endDate'>>,
): Promise<CalendarRemovalResult> {
  const start = startOfLocalDate(range.startDate);
  const end = endOfLocalDate(range.endDate);
  const events = await Calendar.getEventsAsync([calendarId], start, end);
  const result: CalendarRemovalResult = { deleted: 0, failed: 0 };

  for (const event of events) {
    if (!isIShiftManagedEvent(event)) continue;
    const eventDate = getEventLocalStartDate(event);
    if (!eventDate || eventDate < range.startDate || eventDate > range.endDate) continue;

    const syncKey = getEventSyncKey(event);
    const syncOwnerUserId = syncKey ? getUserIdFromSyncKey(syncKey) : null;
    if (!syncOwnerUserId || syncOwnerUserId !== userId) continue;

    const deleted = await deleteManagedEvent(event);
    if (deleted) result.deleted += 1;
    else result.failed += 1;
  }

  return result;
}

export async function syncAllShifts(
  shifts: CalendarShiftForSync[],
  shiftCodes: CalendarShiftCodeForSync[],
  calendarId: string
): Promise<Map<string, string>> {
  const eventIds = new Map<string, string>();
  const shiftsByMonth = new Map<string, CalendarShiftForSync[]>();

  for (const shift of shifts) {
    const yearMonth = shift.date.slice(0, 7);
    const monthShifts = shiftsByMonth.get(yearMonth) ?? [];
    monthShifts.push(shift);
    shiftsByMonth.set(yearMonth, monthShifts);
  }

  // Even this compatibility helper reconciles each month independently so a
  // failure or stale-event cleanup in one month cannot affect another month.
  for (const [yearMonth, monthShifts] of [...shiftsByMonth].sort(([a], [b]) => a.localeCompare(b))) {
    const [year, month] = yearMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const result = await reconcileShiftsToCalendar(monthShifts, shiftCodes, calendarId, {
      startDate: `${yearMonth}-01`,
      endDate: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
    });
    result.eventIdsByShiftId.forEach((eventId, shiftId) => eventIds.set(shiftId, eventId));
  }

  return eventIds;
}

export async function reconcileShiftsToCalendar(
  shifts: CalendarShiftForSync[],
  shiftCodes: CalendarShiftCodeForSync[],
  calendarId: string,
  range?: CalendarSyncDateRange,
): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    failed: 0,
    eventIdsByShiftId: new Map<string, string>(),
  };

  const reconcileRange = getReconcileRange(shifts, range);
  if (!reconcileRange) return result;

  const events = await Calendar.getEventsAsync([calendarId], reconcileRange.start, reconcileRange.end);
  const eventsBySyncKey = new Map<string, Calendar.Event[]>();
  const eventsById = new Map<string, Calendar.Event>();

  for (const event of events) {
    eventsById.set(event.id, event);

    const syncKey = getEventSyncKey(event);
    if (syncKey) {
      const bucket = eventsBySyncKey.get(syncKey) ?? [];
      bucket.push(event);
      eventsBySyncKey.set(syncKey, bucket);
      continue;
    }

    // Legacy events without an ownership key are read-only. Reusing one by
    // date could rewrite another account's event on a shared destination.
  }

  const desiredKeys = new Set<string>();
  const targetUserIds = range?.userId
    ? new Set([range.userId])
    : new Set(shifts.map((shift) => shift.user_id));
  const touchedEventIds = new Set<string>();
  const desiredShifts = [...shifts].sort((a, b) => a.date.localeCompare(b.date));

  for (const shift of desiredShifts) {
    const syncKey = getShiftSyncKey(shift, range?.userId);
    desiredKeys.add(syncKey);
    const codeInfo = shiftCodes.find((sc) => sc.code === shift.shift_code);
    const eventDetails = buildEventDetails(
      shift,
      codeInfo,
      calendarId,
      range?.alarmMinutes,
      range?.userId,
    );
    const keyedCandidates = eventsBySyncKey.get(syncKey) ?? [];
    // calendar_event_id predates multi-user claims and only has room for one
    // device event. Never reuse it while syncing a canonical shift for a
    // different claimant, or two accounts on the same iPhone could overwrite
    // one another's event. Shared rows rely on the per-user note sync key.
    const storedCandidate =
      (!range?.userId || shift.user_id === range.userId) && shift.calendar_event_id
        ? eventsById.get(shift.calendar_event_id)
        : undefined;
    const storedCandidateKey = storedCandidate ? getEventSyncKey(storedCandidate) : null;
    const storedCandidateOwner = storedCandidateKey
      ? getUserIdFromSyncKey(storedCandidateKey)
      : null;
    const selected =
      keyedCandidates.find((event) => !touchedEventIds.has(event.id)) ||
      (storedCandidate &&
        storedCandidateOwner === (range?.userId || shift.user_id) &&
        !touchedEventIds.has(storedCandidate.id)
        ? storedCandidate
        : undefined);

    try {
      let eventId: string;
      if (selected) {
        await Calendar.updateEventAsync(selected.id, eventDetails);
        eventId = selected.id;
        result.updated += 1;
      } else {
        eventId = await Calendar.createEventAsync(calendarId, eventDetails);
        result.created += 1;
      }

      result.eventIdsByShiftId.set(shift.id, eventId);
      touchedEventIds.add(eventId);

      const duplicateCandidates = keyedCandidates.filter((event, index, all) =>
        event.id !== eventId &&
        all.findIndex((candidate) => candidate.id === event.id) === index
      );

      for (const duplicate of duplicateCandidates) {
        if (touchedEventIds.has(duplicate.id)) continue;
        const deleted = await deleteManagedEvent(duplicate);
        if (deleted) {
          touchedEventIds.add(duplicate.id);
          result.deleted += 1;
        }
      }
    } catch (error) {
      result.failed += 1;
      console.error(`Failed to reconcile shift ${shift.id}:`, error);
    }
  }

  for (const event of events) {
    if (touchedEventIds.has(event.id)) continue;

    const syncKey = getEventSyncKey(event);
    const eventDate = getEventLocalStartDate(event);
    const isEventInTargetRange = !!eventDate && (
      !range?.startDate || eventDate >= range.startDate
    ) && (
      !range?.endDate || eventDate <= range.endDate
    );
    const syncKeyUserId = syncKey ? getUserIdFromSyncKey(syncKey) : null;
    const shouldDelete =
      isEventInTargetRange &&
      !!syncKey &&
      isIShiftSyncKey(syncKey) &&
      !!syncKeyUserId &&
      targetUserIds.has(syncKeyUserId) &&
      !desiredKeys.has(syncKey);

    if (!shouldDelete) continue;

    const deleted = await deleteManagedEvent(event);
    if (deleted) result.deleted += 1;
  }

  return result;
}
