import { create } from 'zustand';

// Lightweight in-app notification queue. We don't ship system push yet;
// these banners only fire while the app is open. Each item is shown by
// NotificationBanner at the root of the app.

export interface InAppNotification {
  id: string;
  message: string;
  // Optional date the notification points at (YYYY-MM-DD). Tapping the
  // banner navigates to the calendar tab on that day.
  navigateToDate?: string;
  createdAt: number;
  // How many identical events have been folded into this banner. A bulk
  // operation (e.g. re-saving a schedule) can fire dozens of change events
  // at once; instead of stacking a wall of identical banners that looks
  // like the app hung, we collapse them into one banner with a count.
  count: number;
}

interface NotificationState {
  notifications: InAppNotification[];
  push: (n: Omit<InAppNotification, 'id' | 'createdAt' | 'count'>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;
const nextId = () => `n-${Date.now()}-${++counter}`;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  push: (n) => {
    set((state) => {
      // Coalesce identical messages: bump the existing banner's count and
      // refresh it to the top instead of adding a duplicate. This is what
      // turns a burst of "someone removed a shift" events into a single
      // "someone removed a shift ×12" banner.
      const existingIdx = state.notifications.findIndex((x) => x.message === n.message);
      if (existingIdx >= 0) {
        const existing = state.notifications[existingIdx];
        const merged: InAppNotification = {
          ...existing,
          count: existing.count + 1,
          createdAt: Date.now(),
          navigateToDate: n.navigateToDate ?? existing.navigateToDate,
        };
        const rest = state.notifications.filter((_, i) => i !== existingIdx);
        return { notifications: [merged, ...rest].slice(0, 5) };
      }
      const item: InAppNotification = {
        id: nextId(),
        createdAt: Date.now(),
        count: 1,
        ...n,
      };
      // Cap at 5 to avoid spam if many different shifts change at once.
      return { notifications: [item, ...state.notifications].slice(0, 5) };
    });
  },
  dismiss: (id) => {
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
  },
  clear: () => set({ notifications: [] }),
}));
