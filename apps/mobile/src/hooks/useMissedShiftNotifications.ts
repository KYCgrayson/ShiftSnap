import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { useGroupStore } from '../stores/groupStore';
import { useNotificationStore } from '../stores/notificationStore';
import { getIsGuest } from '../stores/authStore';
import i18n from '../i18n';

const LAST_SEEN_KEY = 'shiftsnap:notifications_last_seen';

// Only surface notifications for changes within this window. Avoids
// flooding the user with months of old activity if they have not
// opened the app for a long time.
const MAX_LOOKBACK_DAYS = 14;

// Show at most this many missed-notification banners per launch. The
// banner queue caps total visible at 5; we cap at 5 fetched too.
const MAX_BANNERS_PER_LAUNCH = 5;

export function useMissedShiftNotifications(userId: string | undefined, initialized: boolean) {
  const ranForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialized || !userId || getIsGuest()) return;
    // Run once per (userId, app launch). Re-mounts of the root layout
    // would otherwise re-fire and re-show notifications.
    if (ranForRef.current === userId) return;
    ranForRef.current = userId;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(LAST_SEEN_KEY);
        const now = new Date();
        const lookbackFloor = new Date(now.getTime() - MAX_LOOKBACK_DAYS * 86400000);
        const since = stored ? new Date(stored) : lookbackFloor;
        const sinceIso =
          since > lookbackFloor ? since.toISOString() : lookbackFloor.toISOString();

        // Wait briefly for groups to load so we can resolve member names.
        // RLS on shifts already restricts to shifts the user can see,
        // so we don't have to filter by group here.
        const { data, error } = await supabase
          .from('shifts')
          .select('id, user_id, date, updated_at')
          .neq('user_id', userId)
          .gte('updated_at', sinceIso)
          .order('updated_at', { ascending: false })
          .limit(MAX_BANNERS_PER_LAUNCH);

        if (error) {
          console.warn('Missed-notifications query failed:', error);
          return;
        }

        if (data && data.length > 0) {
          const members = useGroupStore.getState().members;
          const push = useNotificationStore.getState().push;
          // Show oldest first so the newest ends on top of the stack.
          for (const row of [...data].reverse()) {
            const member = members.find((m) => m.user_id === row.user_id);
            const name =
              member?.display_name || member?.nickname || i18n.t('common.someone');
            const message = i18n.t('notifications.shiftChange', {
              name,
              verb: i18n.t('notifications.updated'),
              date: row.date ?? '',
            });
            push({ message, navigateToDate: row.date });
          }
        }

        await AsyncStorage.setItem(LAST_SEEN_KEY, now.toISOString());
      } catch (e) {
        console.warn('useMissedShiftNotifications failed:', e);
      }
    })();
  }, [initialized, userId]);
}
