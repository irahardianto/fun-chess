import { ref, computed, getCurrentScope, onScopeDispose } from 'vue';

const isOnlineState = ref<boolean>(
  typeof navigator !== 'undefined' ? navigator.onLine : true
);

/**
 * Composable to observe network status with kid-friendly reassurance messages.
 */
export function useNetworkStatus() {
  if (typeof navigator !== 'undefined') {
    isOnlineState.value = navigator.onLine;
  }

  function handleOnline() {
    isOnlineState.value = true;
    if (typeof console !== 'undefined') {
      console.info('[FC_PWA] Network status changed: Online', {
        isOnline: true,
        timestamp: Date.now(),
      });
    }
  }

  function handleOffline() {
    isOnlineState.value = false;
    if (typeof console !== 'undefined') {
      console.info('[FC_PWA] Network status changed: Offline', {
        isOnline: false,
        timestamp: Date.now(),
      });
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  const cleanup = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(cleanup);
  }

  const isOnline = computed(() => isOnlineState.value);
  const isOffline = computed(() => !isOnlineState.value);
  const offlineHeadline = computed(() => 'Playing 100% Offline! ✨');
  const offlineSubtext = computed(
    () => 'Puzzles, Academy & AI Bots work anywhere!'
  );
  const offlineMessage = computed(
    () => 'Playing 100% Offline! Puzzles, Academy & AI Bots work anywhere! ✨'
  );
  const offlineTitle = computed(() => 'Offline Ready');

  return {
    isOnline,
    isOffline,
    offlineHeadline,
    offlineSubtext,
    offlineMessage,
    offlineTitle,
    setOnlineStatus: (status: boolean) => {
      if (typeof navigator !== 'undefined') {
        try {
          Object.defineProperty(navigator, 'onLine', {
            value: status,
            configurable: true,
            writable: true,
          });
        } catch {}
      }
      isOnlineState.value = status;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(status ? 'online' : 'offline'));
      }
    },
  };
}
