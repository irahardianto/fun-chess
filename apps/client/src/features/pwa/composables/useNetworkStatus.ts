import { ref, computed, getCurrentScope, onScopeDispose, getCurrentInstance, hasInjectionContext, inject } from 'vue';
import { apiClient as defaultApiClient, type IApiClient } from '@/platform/api';
import { useInjectLogger, useInjectApiClient, NETWORK_MONITOR_KEY } from '@/platform/di';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';
import type { INetworkMonitor } from '@/platform/hardware';

export type { INetworkMonitor };
export { NETWORK_MONITOR_KEY };

/**
 * Production implementation of INetworkMonitor using browser window/navigator.
 */
export class BrowserNetworkMonitor implements INetworkMonitor {
  private _listeners = new Set<(isOnline: boolean) => void>();
  private _initialized = false;

  private _onOnline = () => {
    this._listeners.forEach((cb) => cb(true));
  };

  private _onOffline = () => {
    this._listeners.forEach((cb) => cb(false));
  };

  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  addListener(listener: (isOnline: boolean) => void): () => void {
    this._listeners.add(listener);
    if (typeof window !== 'undefined' && !this._initialized) {
      window.addEventListener('online', this._onOnline);
      window.addEventListener('offline', this._onOffline);
      this._initialized = true;
    }
    return () => {
      this._listeners.delete(listener);
      if (this._listeners.size === 0 && typeof window !== 'undefined' && this._initialized) {
        window.removeEventListener('online', this._onOnline);
        window.removeEventListener('offline', this._onOffline);
        this._initialized = false;
      }
    };
  }

  reset(): void {
    if (typeof window !== 'undefined' && this._initialized) {
      window.removeEventListener('online', this._onOnline);
      window.removeEventListener('offline', this._onOffline);
    }
    this._listeners.clear();
    this._initialized = false;
  }
}

/**
 * Mock implementation of INetworkMonitor for deterministic unit and integration testing (MAJ-011).
 */
export class MockNetworkMonitor implements INetworkMonitor {
  private _isOnline: boolean;
  private _listeners = new Set<(isOnline: boolean) => void>();

  constructor(initialOnline = true) {
    this._isOnline = initialOnline;
  }

  isOnline(): boolean {
    return this._isOnline;
  }

  setOnlineStatus(isOnline: boolean): void {
    this._isOnline = isOnline;
    this._listeners.forEach((cb) => cb(isOnline));
  }

  addListener(listener: (isOnline: boolean) => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  reset(): void {
    this._listeners.clear();
  }
}

const defaultBrowserNetworkMonitor = new BrowserNetworkMonitor();

const isOnlineState = ref<boolean>(
  defaultBrowserNetworkMonitor.isOnline()
);

let customLogger: ILogger | null = null;
let customNetworkMonitor: INetworkMonitor | null = null;

export function setNetworkStatusLogger(logger: ILogger | null): void {
  customLogger = logger;
}

export function setNetworkMonitor(monitor: INetworkMonitor | null): void {
  customNetworkMonitor = monitor;
}

function getEffectiveLogger(custom?: ILogger): ILogger {
  return custom ?? customLogger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);
}

interface ResettableMonitor {
  reset: () => void;
}

interface MutableNetworkMonitor {
  setOnlineStatus: (status: boolean) => void;
}

/**
 * Explicit reset hook for module-level network status reactive state (MAJ-011 & MIN-010).
 * Cleans up reactive refs and tears down global window event listeners.
 */
export function resetNetworkStatusState(): void {
  defaultBrowserNetworkMonitor.reset();
  if (customNetworkMonitor && 'reset' in customNetworkMonitor && typeof (customNetworkMonitor as ResettableMonitor).reset === 'function') {
    (customNetworkMonitor as ResettableMonitor).reset();
  }
  isOnlineState.value = (customNetworkMonitor ?? defaultBrowserNetworkMonitor).isOnline();
  customLogger = null;
  customNetworkMonitor = null;
}

/**
 * Composable to observe network status with kid-friendly reassurance messages.
 * Uses centralized IApiClient for connectivity probing per MAJ-007.
 * Uses INetworkMonitor abstraction per MAJ-011.
 */
export function useNetworkStatus(
  client?: IApiClient,
  customLoggerInstance?: ILogger,
  networkMonitor?: INetworkMonitor
) {
  if (customLoggerInstance) {
    customLogger = customLoggerInstance;
  }
  const resolvedClient = client ?? (getCurrentInstance() ? useInjectApiClient() : defaultApiClient);
  const logger = getEffectiveLogger(customLoggerInstance);

  const diMonitor = !networkMonitor && hasInjectionContext() ? inject(NETWORK_MONITOR_KEY, null) : null;
  const effectiveMonitor = networkMonitor ?? customNetworkMonitor ?? diMonitor ?? defaultBrowserNetworkMonitor;

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
