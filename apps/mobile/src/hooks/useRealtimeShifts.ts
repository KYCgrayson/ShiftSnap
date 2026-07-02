import { useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useShiftStore } from '../stores/shiftStore';
import { getIsGuest } from '../stores/authStore';

export function useRealtimeShifts(
  userId: string | undefined,
  yearMonth: string,
  groupId: string | undefined,
) {
  const fetchShiftsWindow = useShiftStore((s) => s.fetchShiftsWindow);

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
        () => {
          // Notification banner is owned by useRealtimeNotifications at
          // the root layout; this listener refetches the calendar's
          // cached 3-month window so any adjacent-month bars stay fresh.
          fetchShiftsWindow(userId, yearMonth);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, yearMonth, groupId]);
}
