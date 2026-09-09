import { ref, computed, getCurrentScope, onScopeDispose, getCurrentInstance } from 'vue';
import { useInjectLogger, useInjectStorage } from '@/platform/di';
import { safeLocalStorage, type KeyValueStorage } from '@/platform/storage';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const SNOOZE_STORAGE_KEY = 'fun_chess_pwa_install_snoozed_until';
export const PWA_SNOOZE_STORAGE_KEY = SNOOZE_STORAGE_KEY;
export const DEFAULT_SNOOZE_DAYS = 7;

/** Shared global states */
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstallModalOpen = ref<boolean>(false);
const isAppInstalledFlag = ref<boolean>(false);
const snoozeTrigger = ref<number>(0);

let listenerCount = 0;
let initialized = false;
let customStorage: KeyValueStorage | null = null;
let customLogger: ILogger | null = null;

export function setPwaInstallStorage(storage: KeyValueStorage | null): void {
  customStorage = storage;
}

export function setPwaInstallLogger(logger: ILogger | null): void {
  customLogger = logger;
}

function getEffectiveStorage(custom?: KeyValueStorage): KeyValueStorage {
  return custom ?? customStorage ?? (getCurrentInstance() ? useInjectStorage() : safeLocalStorage);
}

function getEffectiveLogger(custom?: ILogger): ILogger {
  return custom ?? customLogger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);
}

function checkSnoozeStatus(customStorage?: KeyValueStorage, customLogger?: ILogger): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  snoozeTrigger.value; // reactive dependency
  try {
    const storage = getEffectiveStorage(customStorage);
    const snoozedUntil = storage.getItem(SNOOZE_STORAGE_KEY);
    if (!snoozedUntil) return false;
    const until = Number(snoozedUntil);
    return !isNaN(until) && until > Date.now();
  } catch (err) {
    getEffectiveLogger(customLogger).warn('Failed to read PWA snooze status from storage', {
      operation: 'pwa_check_snooze_status',
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (isAppInstalledFlag.value) return true;
  const isMediaStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const isNavStandalone =
    (navigator as unknown as { standalone?: boolean })?.standalone === true;
  return isMediaStandalone || isNavStandalone;
}

function handleBeforeInstallPrompt(e: Event): void {
  e.preventDefault();
  isAppInstalledFlag.value = false;
  deferredPrompt.value = e as BeforeInstallPromptEvent;
  getEffectiveLogger().info('Captured beforeinstallprompt event', {
    operation: 'pwa_before_install_prompt',
  });
}

function handleAppInstalled(): void {
  isAppInstalledFlag.value = true;
  deferredPrompt.value = null;
  getEffectiveLogger().info('App installed successfully into standalone mode', {
    operation: 'pwa_app_installed',
  });
}

function setupPwaListeners(): void {
  if (typeof window === 'undefined' || initialized) return;

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  initialized = true;
}

function removePwaListeners(): void {
  if (typeof window === 'undefined' || !initialized) return;

  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.removeEventListener('appinstalled', handleAppInstalled);
  initialized = false;
}

/**
 * Explicit reset hook for module-level PWA installation reactive state (MAJ-011 & MIN-010).
 * Resets all module-level reactive refs and detaches global window event listeners.
 */
export function resetPwaInstallState(): void {
  removePwaListeners();
  deferredPrompt.value = null;
  isInstallModalOpen.value = false;
  isAppInstalledFlag.value = false;
  snoozeTrigger.value = 0;
  listenerCount = 0;
  initialized = false;
  customStorage = null;
  customLogger = null;
}

export interface UsePwaInstallOptions {
  storage?: KeyValueStorage;
  logger?: ILogger;
}

/**
 * Composable for device-adaptive PWA installation prompt handling.
 */
export function usePwaInstall(options?: UsePwaInstallOptions) {
  setupPwaListeners();
  listenerCount++;

  const effectiveStorage = getEffectiveStorage(options?.storage);
  const effectiveLogger = getEffectiveLogger(options?.logger);

  const isStandalone = computed<boolean>(() => {
    return checkStandalone();
  });

  const isInstalled = isStandalone;

  const isIosSafari = computed<boolean>(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isIosDevice = /iPhone|iPad|iPod/.test(ua);
    const isIpadDesktopMode =
      navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
    const isMSStream = !!(window as unknown as { MSStream?: unknown })?.MSStream;
    return (isIosDevice || isIpadDesktopMode) && !isMSStream;
  });

  const isIos = isIosSafari;

  const isSnoozed = computed<boolean>(() => checkSnoozeStatus(options?.storage, options?.logger));

  const hasInstallPrompt = computed<boolean>(() => deferredPrompt.value !== null);

  const canInstall = computed<boolean>(() => {
    if (isStandalone.value) return false;
    return deferredPrompt.value !== null || isIosSafari.value || true;
  });

  const isInstallAvailable = canInstall;

  const showInstallBanner = computed<boolean>(() => {
    return (
      canInstall.value &&
      !isSnoozed.value &&
      !isStandalone.value &&
      (deferredPrompt.value !== null || isIosSafari.value)
    );
  });

  async function promptInstall(): Promise<boolean> {
    if (isIosSafari.value) {
      isInstallModalOpen.value = true;
      return true;
    }

    if (deferredPrompt.value) {
      try {
        const promptEvent = deferredPrompt.value;
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        effectiveLogger.info('User response to install prompt', {
          operation: 'pwa_prompt_install',
          outcome: choice.outcome,
        });
        if (choice.outcome === 'accepted') {
          isAppInstalledFlag.value = true;
        }
        deferredPrompt.value = null;
        return choice.outcome === 'accepted';
      } catch (err) {
        effectiveLogger.error('Error prompting installation', {
          operation: 'pwa_prompt_install',
          error: err instanceof Error ? err.message : String(err),
        });
        isInstallModalOpen.value = true;
        return false;
      }
    }

    // Default fallback to modal guide
    isInstallModalOpen.value = true;
    return true;
  }

  function snoozePrompt(days: number = DEFAULT_SNOOZE_DAYS): void {
    const validDays =
      typeof days === 'number' && !isNaN(days) && days > 0 ? days : DEFAULT_SNOOZE_DAYS;
    const until = Date.now() + validDays * 24 * 60 * 60 * 1000;
    try {
      effectiveStorage.setItem(SNOOZE_STORAGE_KEY, until.toString());
    } catch (err) {
      effectiveLogger.warn('Failed to persist install snooze', {
        operation: 'pwa_snooze_prompt',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    snoozeTrigger.value++;
    effectiveLogger.info('Install prompt snoozed', {
      operation: 'pwa_snooze_prompt',
      days: validDays,
      until: new Date(until).toISOString(),
    });
  }

  function dismissInstall(days: number = DEFAULT_SNOOZE_DAYS): void {
    snoozePrompt(days);
  }

  function openInstallModal(): void {
    isInstallModalOpen.value = true;
  }

  function closeInstallModal(): void {
    isInstallModalOpen.value = false;
  }

  function resetSnooze(): void {
    try {
      effectiveStorage.removeItem(SNOOZE_STORAGE_KEY);
    } catch (err) {
      effectiveLogger.warn('Failed to reset install snooze from storage', {
        operation: 'pwa_reset_snooze',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    snoozeTrigger.value++;
  }

  const cleanup = () => {
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0) {
      removePwaListeners();
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(cleanup);
  }

  return {
    deferredPrompt,
    isInstalled,
    isStandalone,
    isIosSafari,
    isIos,
    isSnoozed,
    canInstall,
    isInstallAvailable,
    hasInstallPrompt,
    showInstallBanner,
    isInstallModalOpen,
    promptInstall,
    snoozePrompt,
    dismissInstall,
    openInstallModal,
    closeInstallModal,
    resetSnooze,
    // Test helpers
    setDeferredPrompt: (prompt: BeforeInstallPromptEvent | null) => {
      deferredPrompt.value = prompt;
      if (prompt) isAppInstalledFlag.value = false;
    },
    setInstalled: (status: boolean) => {
      isAppInstalledFlag.value = status;
    },
  };
}
