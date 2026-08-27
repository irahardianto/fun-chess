import { ref, computed, getCurrentScope, onScopeDispose } from 'vue';

const isOnlineState = ref<boolean>(
  typeof navigator !== 'undefined' ? navigator.onLine : true
);

let listenerCount = 0;
let initialized = false;

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

function setupNetworkListeners() {
  if (typeof window === 'undefined' || initialized) return;
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  initialized = true;
}

function removeNetworkListeners() {
  if (typeof window === 'undefined' || !initialized) return;
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  initialized = false;
}

/**
 * Composable to observe network status with kid-friendly reassurance messages.
 */
export function useNetworkStatus() {
  setupNetworkListeners();
  listenerCount++;

  if (typeof navigator !== 'undefined') {
    isOnlineState.value = navigator.onLine;
  }

  const cleanup = () => {
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0) {
      removeNetworkListeners();
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

  async function checkConnectivity(probeUrl: string = '/favicon.svg'): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator.onLine) {
      isOnlineState.value = false;
      return false;
    }

    try {
      const response = await fetch(`${probeUrl}?_t=${Date.now()}`, {
        method: 'HEAD',
        cache: 'no-store',
      });
      const online = response.ok;
      isOnlineState.value = online;
      return online;
    } catch {
      isOnlineState.value = false;
      return false;
    }
  }

  return {
    isOnline,
    isOffline,
    offlineHeadline,
    offlineSubtext,
    offlineMessage,
    offlineTitle,
    checkConnectivity,
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
