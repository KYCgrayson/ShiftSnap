import { useEffect } from 'react';
import { supabase } from '../services/supabase';
import { getIsGuest } from '../stores/authStore';
import { useGroupStore } from '../stores/groupStore';
import { useNotificationStore } from '../stores/notificationStore';
import i18n from '../i18n';

// App-wide realtime listener that fires the in-app banner whenever any
// shift the user can see (RLS-filtered) changes. Lives in the root
// layout so notifications work on every tab, not just calendar.
//
// useRealtimeShifts on the calendar tab still does the month-refetch
// for its own state; this hook only pushes the banner.
export function useRealtimeNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId || getIsGuest()) return;

    const channel = supabase
      .channel(`shifts-notify-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        (payload) => {
          const row: any = payload.new ?? payload.old ?? {};
          // Skip our own edits — the user doesn't need to be told they
          // just saved something.
          if (!row || row.user_id === userId) return;

          // A re-save / claim runs a bulk delete + insert. DELETE payloads
          // only carry a full pre-image when REPLICA IDENTITY FULL is in
          // effect; otherwise row.user_id / row.date come back empty and we
          // can neither attribute the change nor navigate to it. Those
          // produce the "有人 刪除了 的班次" (empty name + empty date) banners
          // that flooded the screen. If we can't resolve a date, drop it —
          // an un-navigable, un-attributable banner is pure noise.
          if (!row.date) return;

          const members = useGroupStore.getState().members;
          const member = members.find((m) => m.user_id === row.user_id);
          const name =
            member?.display_name || member?.nickname || i18n.t('common.someone');
          const verb =
            payload.eventType === 'INSERT'
              ? i18n.t('notifications.added')
              : payload.eventType === 'DELETE'
                ? i18n.t('notifications.removed')
                : i18n.t('notifications.updated');
          useNotificationStore.getState().push({
            message: i18n.t('notifications.shiftChange', {
              name,
              verb,
              date: row.date ?? '',
            }),
            navigateToDate: row.date,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
