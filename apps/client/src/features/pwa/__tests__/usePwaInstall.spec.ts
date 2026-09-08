import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import {
  usePwaInstall,
  resetPwaInstallState,
  SNOOZE_STORAGE_KEY,
  DEFAULT_SNOOZE_DAYS,
  BeforeInstallPromptEvent,
} from '../composables/usePwaInstall';

describe('usePwaInstall Composable', () => {
  let mockStorage: Record<string, string> = {};
  let originalUserAgent: string;
  let originalPlatform: string;
  let originalMaxTouchPoints: number;

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };
    vi.stubGlobal('localStorage', storageMock);

    originalUserAgent = navigator.userAgent;
    originalPlatform = navigator.platform;
    originalMaxTouchPoints = navigator.maxTouchPoints;

    // Default matchMedia mock (non-standalone)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    resetPwaInstallState();
    const { setDeferredPrompt, setInstalled, resetSnooze, closeInstallModal } = usePwaInstall();
    setDeferredPrompt(null);
    setInstalled(false);
    resetSnooze();
    closeInstallModal();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPwaInstallState();
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalMaxTouchPoints,
      configurable: true,
      writable: true,
    });
    if ((navigator as any).standalone !== undefined) {
      delete (navigator as any).standalone;
    }
  });

  it('initializes with canInstall as true (non-standalone) and showInstallBanner as false before prompt event', () => {
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    expect(pwa?.canInstall.value).toBe(true);
    expect(pwa?.isInstallAvailable.value).toBe(true);
    expect(pwa?.hasInstallPrompt.value).toBe(false);
    expect(pwa?.showInstallBanner.value).toBe(false);
    expect(pwa?.isStandalone.value).toBe(false);
    expect(pwa?.isIosSafari.value).toBe(false);
    scope.stop();
  });

  it('captures beforeinstallprompt event, calls preventDefault, and sets showInstallBanner to true', () => {
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    expect(pwa?.hasInstallPrompt.value).toBe(false);
    expect(pwa?.showInstallBanner.value).toBe(false);

    const mockEvent = new Event('beforeinstallprompt', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(mockEvent, 'preventDefault');

    window.dispatchEvent(mockEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(pwa?.canInstall.value).toBe(true);
    expect(pwa?.hasInstallPrompt.value).toBe(true);
    expect(pwa?.showInstallBanner.value).toBe(true);
    scope.stop();
  });

  it('updates hasInstallPrompt and showInstallBanner when setDeferredPrompt test helper is used', () => {
    const { canInstall, hasInstallPrompt, showInstallBanner, setDeferredPrompt } = usePwaInstall();

    expect(hasInstallPrompt.value).toBe(false);
    expect(showInstallBanner.value).toBe(false);

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    setDeferredPrompt(mockPromptEvent);

    expect(canInstall.value).toBe(true);
    expect(hasInstallPrompt.value).toBe(true);
    expect(showInstallBanner.value).toBe(true);
  });

  it('triggers promptInstall() and handles accepted outcome', async () => {
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    const promptSpy = vi.fn().mockResolvedValue(undefined);
    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: promptSpy,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    pwa?.setDeferredPrompt(mockPromptEvent);
    expect(pwa?.canInstall.value).toBe(true);

    const result = await pwa?.promptInstall();

    expect(promptSpy).toHaveBeenCalled();
    expect(result).toBe(true);
    expect(pwa?.isInstalled.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(false);
    scope.stop();
  });

  it('triggers promptInstall() and handles dismissed outcome', async () => {
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    const promptSpy = vi.fn().mockResolvedValue(undefined);
    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: promptSpy,
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    pwa?.setDeferredPrompt(mockPromptEvent);

    const result = await pwa?.promptInstall();

    expect(promptSpy).toHaveBeenCalled();
    expect(result).toBe(false);
    scope.stop();
  });

  it('falls back to opening install modal when promptInstall is called without deferredPrompt', async () => {
    const { isInstallModalOpen, promptInstall, setDeferredPrompt } = usePwaInstall();
    setDeferredPrompt(null);

    expect(isInstallModalOpen.value).toBe(false);
    const result = await promptInstall();
    expect(result).toBe(true);
    expect(isInstallModalOpen.value).toBe(true);
  });

  it('opens and closes modal manually with openInstallModal and closeInstallModal', () => {
    const { isInstallModalOpen, openInstallModal, closeInstallModal } = usePwaInstall();

    expect(isInstallModalOpen.value).toBe(false);
    openInstallModal();
    expect(isInstallModalOpen.value).toBe(true);
    closeInstallModal();
    expect(isInstallModalOpen.value).toBe(false);
  });

  it('snoozes floating banner without disabling manual canInstall capability', () => {
    const {
      showInstallBanner,
      canInstall,
      isInstallAvailable,
      setDeferredPrompt,
      snoozePrompt,
      isSnoozed,
      resetSnooze,
    } = usePwaInstall();

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    setDeferredPrompt(mockPromptEvent);
    expect(showInstallBanner.value).toBe(true);
    expect(canInstall.value).toBe(true);

    snoozePrompt(DEFAULT_SNOOZE_DAYS);
    expect(isSnoozed.value).toBe(true);
    // Floating banner is snoozed
    expect(showInstallBanner.value).toBe(false);
    // Manual install capability REMAINS active
    expect(canInstall.value).toBe(true);
    expect(isInstallAvailable.value).toBe(true);

    const storedSnooze = mockStorage[SNOOZE_STORAGE_KEY];
    expect(storedSnooze).toBeDefined();
    expect(Number(storedSnooze)).toBeGreaterThan(Date.now());

    resetSnooze();
    expect(isSnoozed.value).toBe(false);
    expect(showInstallBanner.value).toBe(true);
  });

  it('suppresses showInstallBanner when 7-day snooze is active while retaining canInstall', () => {
    const threeDaysFromNow = Date.now() + 3 * 24 * 60 * 60 * 1000;
    mockStorage[SNOOZE_STORAGE_KEY] = String(threeDaysFromNow);

    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    pwa?.setDeferredPrompt(mockPromptEvent);

    expect(pwa?.showInstallBanner.value).toBe(false);
    expect(pwa?.canInstall.value).toBe(true);
    scope.stop();
  });

  it('allows showInstallBanner when snooze timestamp has expired', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    mockStorage[SNOOZE_STORAGE_KEY] = String(eightDaysAgo);

    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    pwa?.setDeferredPrompt(mockPromptEvent);

    expect(pwa?.showInstallBanner.value).toBe(true);
    scope.stop();
  });

  it('detects iOS Safari environment accurately via userAgent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      configurable: true,
      writable: true,
    });

    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    expect(pwa?.isIosSafari.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(true);
    scope.stop();
  });

  it('detects iPadOS 13+ desktop Safari via MacIntel platform and maxTouchPoints', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
      writable: true,
    });

    const { isIosSafari } = usePwaInstall();
    expect(isIosSafari.value).toBe(true);
  });

  it('detects standalone display mode via window.matchMedia', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('display-mode: standalone'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    expect(pwa?.isStandalone.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(false);
    expect(pwa?.showInstallBanner.value).toBe(false);
    scope.stop();
  });

  it('detects iOS standalone mode via navigator.standalone', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      configurable: true,
      writable: true,
    });
    (navigator as any).standalone = true;

    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    expect(pwa?.isStandalone.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(false);
    scope.stop();
  });

  it('handles appinstalled event by updating installed state', () => {
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;
    pwa?.setDeferredPrompt(mockPromptEvent);
    expect(pwa?.canInstall.value).toBe(true);

    window.dispatchEvent(new Event('appinstalled'));

    expect(pwa?.isInstalled.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(false);
    scope.stop();
  });

  describe('resetPwaInstallState hook [MAJ-011]', () => {
    it('resets all module-level reactive state and listeners cleanly', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const pwa = usePwaInstall();

      window.dispatchEvent(new Event('appinstalled'));
      expect(pwa.isInstalled.value).toBe(true);

      expect(typeof resetPwaInstallState).toBe('function');
      resetPwaInstallState();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'beforeinstallprompt',
        expect.any(Function)
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'appinstalled',
        expect.any(Function)
      );

      const freshPwa = usePwaInstall();
      expect(freshPwa.isInstalled.value).toBe(false);
      expect(freshPwa.hasInstallPrompt.value).toBe(false);
    });
  });
});
