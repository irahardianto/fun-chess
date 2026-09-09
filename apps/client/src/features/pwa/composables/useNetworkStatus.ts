import { ref, computed, getCurrentScope, onScopeDispose, getCurrentInstance } from 'vue';
import { apiClient as defaultApiClient, type IApiClient } from '@/platform/api';
import { useInjectLogger, useInjectApiClient } from '@/platform/di';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';

const isOnlineState = ref<boolean>(
  typeof navigator !== 'undefined' ? navigator.onLine : true
);

let listenerCount = 0;
let initialized = false;
let customLogger: ILogger | null = null;

export function setNetworkStatusLogger(logger: ILogger | null): void {
  customLogger = logger;
}

function getEffectiveLogger(custom?: ILogger): ILogger {
  return custom ?? customLogger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);
}

function handleOnline(): void {
  isOnlineState.value = true;
  getEffectiveLogger().info('Network status changed to online', {
    operation: 'network_status_change',
    isOnline: true,
  });
}

function handleOffline(): void {
  isOnlineState.value = false;
  getEffectiveLogger().info('Network status changed to offline', {
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
  customLogger = null;
}

/**
 * Composable to observe network status with kid-friendly reassurance messages.
 * Uses centralized IApiClient for connectivity probing per MAJ-007.
 */
export function useNetworkStatus(client?: IApiClient, customLoggerInstance?: ILogger) {
  if (customLoggerInstance) {
    customLogger = customLoggerInstance;
  }
  const resolvedClient = client ?? (getCurrentInstance() ? useInjectApiClient() : defaultApiClient);
  const logger = getEffectiveLogger(customLoggerInstance);
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
      const online = await resolvedClient.checkConnectivity(probeUrl);
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
