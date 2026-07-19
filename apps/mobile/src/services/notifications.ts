import * as Notifications from 'expo-notifications';

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

function normalizeTime(time?: string | null): string | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export async function scheduleShiftReminder(
  shift: { id: string; date: string; shift_code: string; start_time: string | null },
  codeInfo: { meaning: string } | undefined,
  alarmMinutes: number = 60
): Promise<string | null> {
  const startTime = normalizeTime(shift.start_time);
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

export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('cancelAllReminders failed:', e);
  }
}
