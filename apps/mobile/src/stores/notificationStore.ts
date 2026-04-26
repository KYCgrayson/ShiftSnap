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
}

interface NotificationState {
  notifications: InAppNotification[];
  push: (n: Omit<InAppNotification, 'id' | 'createdAt'>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;
const nextId = () => `n-${Date.now()}-${++counter}`;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  push: (n) => {
    const item: InAppNotification = {
      id: nextId(),
      createdAt: Date.now(),
      ...n,
    };
    // Cap at 5 to avoid spam if many shifts change at once.
    set((state) => ({
      notifications: [item, ...state.notifications].slice(0, 5),
    }));
  },
  dismiss: (id) => {
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
  },
  clear: () => set({ notifications: [] }),
}));
