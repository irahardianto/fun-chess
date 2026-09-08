import { ref, computed, getCurrentScope, onScopeDispose } from 'vue';
import { apiClient, type IApiClient } from '@/platform/api';
import { logger } from '@/platform/telemetry';

const isOnlineState = ref<boolean>(
  typeof navigator !== 'undefined' ? navigator.onLine : true
);

let listenerCount = 0;
let initialized = false;

function handleOnline(): void {
  isOnlineState.value = true;
  logger.info('Network status changed to online', {
    operation: 'network_status_change',
    isOnline: true,
  });
}

function handleOffline(): void {
  isOnlineState.value = false;
  logger.info('Network status changed to offline', {
    operation: 'network_status_change',
    isOnline: false,
  });
}

function setupNetworkListeners(): void {
  if (typeof window === 'undefined' || initialized) return;
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  initialized = true;
}

function removeNetworkListeners(): void {
  if (typeof window === 'undefined' || !initialized) return;
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  initialized = false;
}

/**
 * Explicit reset hook for module-level network status reactive state (MAJ-011 & MIN-010).
 * Cleans up reactive refs and tears down global window event listeners.
 */
export function resetNetworkStatusState(): void {
  removeNetworkListeners();
  isOnlineState.value = typeof navigator !== 'undefined' ? navigator.onLine : true;
  listenerCount = 0;
  initialized = false;
}

/**
 * Composable to observe network status with kid-friendly reassurance messages.
 * Uses centralized IApiClient for connectivity probing per MAJ-007.
 */
export function useNetworkStatus(client: IApiClient = apiClient) {
  if (!initialized && typeof navigator !== 'undefined') {
    isOnlineState.value = navigator.onLine;
  }
  setupNetworkListeners();
  listenerCount++;

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
      const online = await client.checkConnectivity(probeUrl);
      isOnlineState.value = online;
      return online;
    } catch (err) {
      logger.warn('Connectivity probe failed', {
        operation: 'check_connectivity',
        probeUrl,
        error: err instanceof Error ? err.message : String(err),
      });
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
        } catch (err) {
          logger.warn('Could not redefine navigator.onLine', {
            operation: 'pwa_set_online_status',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      isOnlineState.value = status;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(status ? 'online' : 'offline'));
      }
    },
  };
}
