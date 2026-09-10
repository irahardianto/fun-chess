import { ref, computed, onScopeDispose, getCurrentScope, type Ref, type ComputedRef } from 'vue';

function tryOnScopeDispose(fn: () => void): boolean {
  if (getCurrentScope()) {
    onScopeDispose(fn);
    return true;
  }
  return false;
}

export interface AppNotification {
  id: number;
  type: 'error' | 'info' | 'success';
  message: string;
  durationMs?: number;
}

export interface UseNotificationReturn {
  notifications: Ref<AppNotification[]>;
  activeNotification: ComputedRef<AppNotification | null>;
  notificationAnnouncement: ComputedRef<string>;
  showNotification: (
    message: string,
    type?: 'error' | 'info' | 'success',
    durationMs?: number
  ) => void;
  dismissNotification: (id?: number) => void;
  clearAll: () => void;
}

const notifications = ref<AppNotification[]>([]);
const activeNotification = computed<AppNotification | null>(() => notifications.value[0] ?? null);
const notificationAnnouncement = computed<string>(() => activeNotification.value?.message ?? '');

let activeTimer: ReturnType<typeof setTimeout> | null = null;
let lastTimestamp = 0;

function generateId(): number {
  const now = Date.now();
  lastTimestamp = Math.max(now, lastTimestamp + 1);
  return lastTimestamp;
}

function startActiveTimer(): void {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  const current = notifications.value[0];
  if (!current) return;

  const ms = current.durationMs !== undefined ? current.durationMs : current.type === 'error' ? 8000 : 4000;
  if (ms > 0) {
    activeTimer = setTimeout(() => {
      dismissNotification(current.id);
    }, ms);
  }
}

function dismissNotification(id?: number): void {
  if (notifications.value.length === 0) return;

  if (id === undefined || id === notifications.value[0]?.id) {
    if (activeTimer) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
    notifications.value.shift();
    startActiveTimer();
  } else {
    // If an ID was provided that is in the background queue, remove it without resetting active timer
    notifications.value = notifications.value.filter((item) => item.id !== id);
  }
}

/**
 * useNotification composable
 * Reactive FIFO notification queue with auto-dismiss timers,
 * screen reader live-region announcements, and manual dismissal.
 */
export function useNotification(): UseNotificationReturn {
  tryOnScopeDispose(() => {
    if (activeTimer) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
  });

  function clearAll(): void {
    if (activeTimer) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }
    notifications.value = [];
  }

  function showNotification(
    message: string,
    type: 'error' | 'info' | 'success' = 'info',
    durationMs?: number
  ): void {
    const id = generateId();
    const autoDismissMs =
      durationMs !== undefined ? durationMs : type === 'error' ? 8000 : 4000;

    const notification: AppNotification = {
      id,
      type,
      message,
      durationMs: autoDismissMs,
    };

    const wasEmpty = notifications.value.length === 0;
    notifications.value.push(notification);

    if (wasEmpty) {
      startActiveTimer();
    }
  }

  return {
    notifications,
    activeNotification,
    notificationAnnouncement,
    showNotification,
    dismissNotification,
    clearAll,
  };
}
