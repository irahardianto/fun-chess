import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import { usePwaInstall, resetPwaInstallState, SNOOZE_STORAGE_KEY, BeforeInstallPromptEvent } from '../usePwaInstall';

describe('usePwaInstall composable', () => {
  let mockStorage: Record<string, string> = {};
  let originalUserAgent: string;

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

    const { setDeferredPrompt, setInstalled, resetSnooze } = usePwaInstall();
    setDeferredPrompt(null);
    setInstalled(false);
    resetSnooze();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    });
    if ((navigator as any).standalone !== undefined) {
      delete (navigator as any).standalone;
    }
  });

  it('initializes with canInstall as true (non-standalone) and isStandalone as false by default', () => {
    // Arrange & Act
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    // Assert
    expect(pwa?.canInstall.value).toBe(true);
    expect(pwa?.isInstallAvailable.value).toBe(true);
    expect(pwa?.hasInstallPrompt.value).toBe(false);
    expect(pwa?.showInstallBanner.value).toBe(false);
    expect(pwa?.isStandalone.value).toBe(false);
    expect(pwa?.isIosSafari.value).toBe(false);
    scope.stop();
  });

  it('captures beforeinstallprompt event, calls preventDefault, and sets showInstallBanner to true', () => {
    // Arrange
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    const mockEvent = new Event('beforeinstallprompt', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(mockEvent, 'preventDefault');

    // Act
    window.dispatchEvent(mockEvent);

    // Assert
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(pwa?.canInstall.value).toBe(true);
    expect(pwa?.hasInstallPrompt.value).toBe(true);
    expect(pwa?.showInstallBanner.value).toBe(true);
    scope.stop();
  });

  it('triggers promptInstall() and handles accepted outcome', async () => {
    // Arrange
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

    // Act
    const result = await pwa?.promptInstall();

    // Assert
    expect(promptSpy).toHaveBeenCalled();
    expect(result).toBe(true);
    expect(pwa?.isInstalled.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(false);
    scope.stop();
  });

  it('triggers promptInstall() and handles dismissed outcome', async () => {
    // Arrange
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

    // Act
    const result = await pwa?.promptInstall();

    // Assert
    expect(promptSpy).toHaveBeenCalled();
    expect(result).toBe(false);
    scope.stop();
  });

  it('snoozes install prompt for 7 days in localStorage while keeping canInstall active', () => {
    // Arrange
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
    expect(pwa?.canInstall.value).toBe(true);

    // Act - Dismiss/Snooze
    pwa?.snoozePrompt(7);

    // Assert
    expect(pwa?.isSnoozed.value).toBe(true);
    expect(pwa?.showInstallBanner.value).toBe(false);
    expect(pwa?.canInstall.value).toBe(true);

    const storedTimestamp = Number(mockStorage[SNOOZE_STORAGE_KEY]);
    expect(storedTimestamp).toBeGreaterThan(Date.now());
    scope.stop();
  });

  it('suppresses showInstallBanner when 7-day snooze is active while retaining canInstall', () => {
    // Arrange: set snooze timestamp 3 days into future
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

    // Act
    pwa?.setDeferredPrompt(mockPromptEvent);

    // Assert: should remain false due to active snooze, but manual trigger remains available
    expect(pwa?.showInstallBanner.value).toBe(false);
    expect(pwa?.canInstall.value).toBe(true);
    scope.stop();
  });

  it('allows showInstallBanner when snooze timestamp has expired', () => {
    // Arrange: set snooze timestamp in the past (8 days ago)
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

    // Act
    pwa?.setDeferredPrompt(mockPromptEvent);

    // Assert
    expect(pwa?.showInstallBanner.value).toBe(true);
    scope.stop();
  });

  it('detects iOS Safari environment accurately via userAgent', () => {
    // Arrange
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      configurable: true,
      writable: true,
    });

    // Act
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    // Assert
    expect(pwa?.isIosSafari.value).toBe(true);
    // On iOS Safari without beforeinstallprompt, canInstall is enabled for manual iOS instructions
    expect(pwa?.canInstall.value).toBe(true);
    scope.stop();
  });

  it('detects standalone display mode via window.matchMedia', () => {
    // Arrange
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

    // Act
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    // Assert
    expect(pwa?.isStandalone.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(false);
    expect(pwa?.showInstallBanner.value).toBe(false);
    scope.stop();
  });

  it('detects iOS standalone mode via navigator.standalone', () => {
    // Arrange
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      configurable: true,
      writable: true,
    });
    (navigator as any).standalone = true;

    // Act
    const scope = effectScope();
    let pwa: ReturnType<typeof usePwaInstall> | undefined;
    scope.run(() => {
      pwa = usePwaInstall();
    });

    // Assert
    expect(pwa?.isStandalone.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(false);
    scope.stop();
  });

  it('handles appinstalled event by updating installed state', () => {
    // Arrange
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

    // Act
    window.dispatchEvent(new Event('appinstalled'));

    // Assert
    expect(pwa?.isInstalled.value).toBe(true);
    expect(pwa?.canInstall.value).toBe(false);
    scope.stop();
  });

  describe('resetPwaInstallState hook [MAJ-011]', () => {
    it('resets all module-level reactive state and listeners cleanly', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const pwa = usePwaInstall();

      // Trigger appinstalled to change state
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
