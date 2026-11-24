import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_ALARM_MINUTES } from '@shiftsnap/shared';
import { ALARM_MINUTES_KEY } from '../stores/calendarStore';
import { personalShiftTiming, uniquePersonalShifts, type ResolvedShiftTiming } from './personalShifts';

export const NOTIFICATIONS_KEY = 'shiftsnap_notifications_enabled';
export const SHIFT_REMINDERS_CHANNEL_ID = 'shift-reminders';

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(SHIFT_REMINDERS_CHANNEL_ID, {
    name: 'IShift shift reminders',
    description: 'Reminders before scheduled work shifts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4A9DAD',
  });
}

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    // Android 13 does not display its notification permission prompt until a
    // channel exists. This is safe to call repeatedly and updates the channel.
    await ensureAndroidNotificationChannel();
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (e) {
    // Never let a permission-API failure bubble up as an unhandled
    // rejection — that used to crash the app when the toggle was flipped.
    console.warn('requestNotificationPermissions failed:', e);
    return false;
  }
}

export async function scheduleShiftReminder(
  shift: { id: string; date: string; shift_code: string; start_time: string | null },
  codeInfo: { meaning: string } | undefined,
  alarmMinutes: number = 60
): Promise<string | null> {
  const { startTime } = personalShiftTiming(shift);
  if (!startTime) return null;

  const shiftDate = new Date(`${shift.date}T${startTime}:00`);
  // Guard against malformed date/time strings — scheduleNotificationAsync
  // throws on an Invalid Date trigger, which previously surfaced as a crash.
  if (isNaN(shiftDate.getTime())) return null;

  const triggerDate = new Date(shiftDate.getTime() - alarmMinutes * 60 * 1000);

  // Don't schedule if trigger time is in the past
  if (triggerDate <= new Date()) return null;

  const title = codeInfo?.meaning
    ? `${codeInfo.meaning} (${shift.shift_code})`
    : `Shift ${shift.shift_code}`;

  const body = alarmMinutes >= 60
    ? `Your shift starts in ${Math.round(alarmMinutes / 60)} hour${alarmMinutes >= 120 ? 's' : ''}`
    : `Your shift starts in ${alarmMinutes} minutes`;

  try {
    await ensureAndroidNotificationChannel();
    // Android reminders deliberately use Expo's normal best-effort scheduling.
    // We do not request SCHEDULE_EXACT_ALARM because it requires separate
    // system special access that cannot be granted from this notification flow.
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { shiftId: shift.id },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        ...(Platform.OS === 'android' ? { channelId: SHIFT_REMINDERS_CHANNEL_ID } : {}),
      },
    });

    return notificationId;
  } catch (e) {
    // A single un-schedulable reminder should never abort the batch or crash
    // the toggle — log and skip it.
    console.warn('scheduleShiftReminder failed for shift', shift.id, e);
    return null;
  }
}

export async function cancelShiftReminder(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    console.warn('cancelShiftReminder failed:', e);
  }
}

async function cancelScheduledReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('cancelAllReminders failed:', e);
  }
}

type ReminderShift = Parameters<typeof scheduleShiftReminder>[0] & {
  end_time: string | null;
  is_day_off: boolean;
  personal_timing?: ResolvedShiftTiming;
};
type ReminderCodeLookup = (code: string) => {
  meaning: string;
  start_time?: string | null;
  end_time?: string | null;
  is_day_off?: boolean;
} | undefined;

let reminderRefresh: Promise<void> = Promise.resolve();

function queueReminderUpdate(update: () => Promise<void>): Promise<void> {
  reminderRefresh = reminderRefresh.then(update).catch((error) => console.warn('Failed to refresh shift reminders:', error));
  return reminderRefresh;
}

export function cancelAllReminders(): Promise<void> {
  return queueReminderUpdate(cancelScheduledReminders);
}

export function replaceShiftReminders(
  shifts: ReminderShift[],
  getCodeInfo: ReminderCodeLookup,
  minutes: number,
  isCurrent = () => true,
): Promise<void> {
  return queueReminderUpdate(() => scheduleReminders(shifts, getCodeInfo, minutes, isCurrent));
}

async function scheduleReminders(
  shifts: ReminderShift[], getCodeInfo: ReminderCodeLookup, minutes: number, isCurrent: () => boolean,
): Promise<void> {
  if (!isCurrent()) return;
  await cancelScheduledReminders();
  for (const shift of uniquePersonalShifts(shifts, getCodeInfo)) {
    if (!isCurrent()) return;
    const code = getCodeInfo(shift.shift_code);
    const { startTime, isDayOff } = personalShiftTiming(shift, code);
    if (isDayOff || !startTime) continue;
    await scheduleShiftReminder({ ...shift, start_time: startTime }, code, minutes);
  }
}

export function refreshEnabledShiftReminders(
  shifts: ReminderShift[],
  getCodeInfo: ReminderCodeLookup,
  isCurrent: () => boolean,
): Promise<void> {
  return queueReminderUpdate(async () => {
    const [enabled, rawMinutes] = await Promise.all([
      AsyncStorage.getItem(NOTIFICATIONS_KEY),
      AsyncStorage.getItem(ALARM_MINUTES_KEY),
    ]);
    if (enabled !== 'true') return;
    const minutes = Number(rawMinutes);
    await scheduleReminders(
      shifts, getCodeInfo, Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_ALARM_MINUTES, isCurrent,
    );
  });
}
