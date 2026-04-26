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
    if (!userId || getIsGuest()) {
      console.log('[NOTIFY] skipped subscribe', { userId, isGuest: getIsGuest() });
      return;
    }

    console.log('[NOTIFY] subscribing channel for', userId);
    const channel = supabase
      .channel(`shifts-notify-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        (payload) => {
          console.log('[NOTIFY] event received', payload.eventType, (payload.new as any)?.user_id);
          const row: any = payload.new ?? payload.old ?? {};
          // Skip our own edits — the user doesn't need to be told they
          // just saved something.
          if (!row || row.user_id === userId) {
            console.log('[NOTIFY] skipped own change');
            return;
          }

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
      .subscribe((status) => {
        console.log('[NOTIFY] subscribe status:', status);
      });

    return () => {
      console.log('[NOTIFY] removing channel');
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
