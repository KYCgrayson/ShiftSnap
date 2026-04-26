import { useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useShiftStore } from '../stores/shiftStore';
import { getIsGuest } from '../stores/authStore';
import { useGroupStore } from '../stores/groupStore';
import { useNotificationStore } from '../stores/notificationStore';
import i18n from '../i18n';

export function useRealtimeShifts(
  userId: string | undefined,
  yearMonth: string,
  groupId: string | undefined,
) {
  const fetchShiftsForMonth = useShiftStore((s) => s.fetchShiftsForMonth);

  useEffect(() => {
    if (!userId || getIsGuest()) return;

    const channel = supabase
      .channel(`shifts-realtime-${userId}-${groupId ?? 'none'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
        },
        (payload) => {
          fetchShiftsForMonth(userId, yearMonth);
          // Skip own changes — the user already knows about them.
          const row: any = payload.new ?? payload.old ?? {};
          if (!row || row.user_id === userId) return;
          // Resolve member name from the already-loaded members list,
          // fall back to a generic label when unknown.
          const members = useGroupStore.getState().members;
          const member = members.find((m) => m.user_id === row.user_id);
          const name = member?.display_name || member?.nickname || i18n.t('common.someone');
          const date: string | undefined = row.date;
          const verb =
            payload.eventType === 'INSERT'
              ? i18n.t('notifications.added')
              : payload.eventType === 'DELETE'
                ? i18n.t('notifications.removed')
                : i18n.t('notifications.updated');
          const message = i18n.t('notifications.shiftChange', {
            name,
            verb,
            date: date ?? '',
          });
          useNotificationStore.getState().push({ message, navigateToDate: date });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, yearMonth, groupId]);
}
