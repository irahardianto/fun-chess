import { ref, computed, getCurrentScope, onScopeDispose } from 'vue';
import { safeLocalStorage } from '@/platform/storage';

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

function checkSnoozeStatus(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  snoozeTrigger.value; // reactive dependency
  try {
    const snoozedUntil = safeLocalStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!snoozedUntil) return false;
    const until = Number(snoozedUntil);
    return !isNaN(until) && until > Date.now();
  } catch {
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

function handleBeforeInstallPrompt(e: Event) {
  e.preventDefault();
  isAppInstalledFlag.value = false;
  deferredPrompt.value = e as BeforeInstallPromptEvent;
  if (typeof console !== 'undefined') {
    console.info('[FC_PWA] Captured beforeinstallprompt event');
  }
}

function handleAppInstalled() {
  isAppInstalledFlag.value = true;
  deferredPrompt.value = null;
  if (typeof console !== 'undefined') {
    console.info('[FC_PWA] App installed successfully into standalone mode');
  }
}

function setupPwaListeners() {
  if (typeof window === 'undefined' || initialized) return;

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  initialized = true;
}

function removePwaListeners() {
  if (typeof window === 'undefined' || !initialized) return;

  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.removeEventListener('appinstalled', handleAppInstalled);
  initialized = false;
}

/**
 * Composable for device-adaptive PWA installation prompt handling.
 */
export function usePwaInstall() {
  setupPwaListeners();
  listenerCount++;

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

  const isSnoozed = computed<boolean>(() => checkSnoozeStatus());

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
        if (typeof console !== 'undefined') {
          console.info('[FC_PWA] User response to install prompt:', choice.outcome);
        }
        if (choice.outcome === 'accepted') {
          isAppInstalledFlag.value = true;
        }
        deferredPrompt.value = null;
        return choice.outcome === 'accepted';
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error('[FC_PWA] Error prompting installation:', err);
        }
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
      safeLocalStorage.setItem(SNOOZE_STORAGE_KEY, until.toString());
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.warn('[FC_PWA] Failed to persist install snooze:', err);
      }
    }
    snoozeTrigger.value++;
    if (typeof console !== 'undefined') {
      console.info(
        `[FC_PWA] Install prompt snoozed for ${validDays} days until ${new Date(until).toISOString()}`
      );
    }
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
      safeLocalStorage.removeItem(SNOOZE_STORAGE_KEY);
    } catch {}
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
