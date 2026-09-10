import {
  ref,
  computed,
  getCurrentScope,
  onScopeDispose,
  hasInjectionContext,
  inject,
} from 'vue';
import { apiClient as defaultApiClient, type IApiClient } from '@/platform/api';
import { useInjectLogger, useInjectApiClient, NETWORK_MONITOR_KEY } from '@/platform/di';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';
import type { INetworkMonitor } from '@/platform/hardware';
import { BrowserNetworkMonitor } from '@/platform/browser';

export type { INetworkMonitor };
export { NETWORK_MONITOR_KEY, BrowserNetworkMonitor };

const defaultBrowserNetworkMonitor = new BrowserNetworkMonitor();

const isOnlineState = ref<boolean>(
  defaultBrowserNetworkMonitor.isOnline()
);

interface MutableNetworkMonitor {
  setOnlineStatus: (status: boolean) => void;
}

/**
 * Options configuration for {@link useNetworkStatus}.
 */
export interface UseNetworkStatusOptions {
  client?: IApiClient;
  logger?: ILogger;
  monitor?: INetworkMonitor;
}

/**
 * Type guard to detect legacy positional IApiClient parameter.
 */
function isApiClient(value: unknown): value is IApiClient {
  return typeof value === 'object' && value !== null && 'checkConnectivity' in value;
}

/**
 * Explicit reset hook for module-level network status reactive state (MAJ-011 & MIN-010).
 * Cleans up reactive refs and tears down global window event listeners.
 */
export function resetNetworkStatusState(): void {
  defaultBrowserNetworkMonitor.reset();
  isOnlineState.value = defaultBrowserNetworkMonitor.isOnline();
}

/**
 * Composable to observe network status with kid-friendly reassurance messages.
 * Uses centralized IApiClient for connectivity probing per MAJ-007.
 * Uses INetworkMonitor abstraction per MAJ-011.
 *
 * @param optionsOrClient - Options object or legacy IApiClient instance.
 * @param legacyLogger - Legacy positional ILogger instance.
 * @param legacyMonitor - Legacy positional INetworkMonitor instance.
 */
export function useNetworkStatus(
  optionsOrClient?: UseNetworkStatusOptions | IApiClient,
  legacyLogger?: ILogger,
  legacyMonitor?: INetworkMonitor
) {
  const options: UseNetworkStatusOptions = isApiClient(optionsOrClient)
    ? { client: optionsOrClient, logger: legacyLogger, monitor: legacyMonitor }
    : {
        ...optionsOrClient,
        ...(legacyLogger && !optionsOrClient?.logger ? { logger: legacyLogger } : {}),
        ...(legacyMonitor && !optionsOrClient?.monitor ? { monitor: legacyMonitor } : {}),
      };

  const resolvedClient =
    options.client ?? (hasInjectionContext() ? useInjectApiClient() : defaultApiClient);

  const logger =
    options.logger ?? (hasInjectionContext() ? useInjectLogger() : defaultLogger);

  const effectiveMonitor =
    options.monitor ??
    (hasInjectionContext()
      ? inject(NETWORK_MONITOR_KEY, () => new BrowserNetworkMonitor(), true)
      : defaultBrowserNetworkMonitor);

  isOnlineState.value = effectiveMonitor.isOnline();

  const unsubscribeMonitor = effectiveMonitor.addListener((online) => {
    isOnlineState.value = online;
    logger.info(`Network status changed to ${online ? 'online' : 'offline'}`, {
      operation: 'network_status_change',
      isOnline: online,
    });
  });

  const cleanup = () => {
    unsubscribeMonitor();
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
    if (typeof window === 'undefined' || !effectiveMonitor.isOnline()) {
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
      isOnlineState.value = status;
      if ('setOnlineStatus' in effectiveMonitor && typeof (effectiveMonitor as MutableNetworkMonitor).setOnlineStatus === 'function') {
        (effectiveMonitor as MutableNetworkMonitor).setOnlineStatus(status);
      }
    },
  };
}
