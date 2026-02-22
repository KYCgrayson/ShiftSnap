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
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

export async function scheduleShiftReminder(
  shift: { id: string; date: string; shift_code: string; start_time: string | null },
  codeInfo: { meaning: string } | undefined,
  alarmMinutes: number = 60
): Promise<string | null> {
  if (!shift.start_time) return null;

  const shiftDate = new Date(`${shift.date}T${shift.start_time}:00`);
  const triggerDate = new Date(shiftDate.getTime() - alarmMinutes * 60 * 1000);

  // Don't schedule if trigger time is in the past
  if (triggerDate <= new Date()) return null;

  const title = codeInfo?.meaning
    ? `${codeInfo.meaning} (${shift.shift_code})`
    : `Shift ${shift.shift_code}`;

  const body = alarmMinutes >= 60
    ? `Your shift starts in ${Math.round(alarmMinutes / 60)} hour${alarmMinutes >= 120 ? 's' : ''}`
    : `Your shift starts in ${alarmMinutes} minutes`;

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
}

export async function cancelShiftReminder(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
