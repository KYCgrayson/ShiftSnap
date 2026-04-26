import { useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useShiftStore } from '../stores/shiftStore';
import { getIsGuest } from '../stores/authStore';

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
        () => {
          fetchShiftsForMonth(userId, yearMonth);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, yearMonth, groupId]);
}
