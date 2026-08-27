import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePwaInstall, SNOOZE_STORAGE_KEY, BeforeInstallPromptEvent } from '../composables/usePwaInstall';

describe('usePwaInstall Composable', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
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
    });

    const { setDeferredPrompt, setInstalled, resetSnooze, closeInstallModal } = usePwaInstall();
    setDeferredPrompt(null);
    setInstalled(false);
    resetSnooze();
    closeInstallModal();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with canInstall as true (when non-standalone) and showInstallBanner as false before prompt event', () => {
    const { canInstall, isInstallAvailable, hasInstallPrompt, showInstallBanner } = usePwaInstall();

    expect(canInstall.value).toBe(true);
    expect(isInstallAvailable.value).toBe(true);
    expect(hasInstallPrompt.value).toBe(false);
    expect(showInstallBanner.value).toBe(false);
  });

  it('captures beforeinstallprompt event and updates hasInstallPrompt & showInstallBanner', () => {
    const { canInstall, hasInstallPrompt, showInstallBanner, setDeferredPrompt } = usePwaInstall();

    expect(canInstall.value).toBe(true);
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

  it('snoozes floating banner without disabling manual canInstall capability', () => {
    const { showInstallBanner, canInstall, isInstallAvailable, setDeferredPrompt, snoozePrompt, isSnoozed, resetSnooze } =
      usePwaInstall();

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    setDeferredPrompt(mockPromptEvent);
    expect(showInstallBanner.value).toBe(true);
    expect(canInstall.value).toBe(true);

    snoozePrompt(7);
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

  it('executes promptInstall successfully when deferredPrompt is available', async () => {
    const { setDeferredPrompt, promptInstall, isInstalled, canInstall } = usePwaInstall();

    const mockPrompt = vi.fn().mockResolvedValue(undefined);
    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: mockPrompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    setDeferredPrompt(mockPromptEvent);

    const result = await promptInstall();
    expect(mockPrompt).toHaveBeenCalled();
    expect(result).toBe(true);
    expect(isInstalled.value).toBe(true);
    expect(canInstall.value).toBe(false);
  });

  it('falls back to opening install modal when promptInstall is called without deferredPrompt', async () => {
    const { isInstallModalOpen, promptInstall, setDeferredPrompt } = usePwaInstall();
    setDeferredPrompt(null);

    expect(isInstallModalOpen.value).toBe(false);
    const result = await promptInstall();
    expect(result).toBe(true);
    expect(isInstallModalOpen.value).toBe(true);
  });

  it('opens modal for iOS or manual trigger', () => {
    const { isInstallModalOpen, openInstallModal, closeInstallModal } = usePwaInstall();

    expect(isInstallModalOpen.value).toBe(false);
    openInstallModal();
    expect(isInstallModalOpen.value).toBe(true);
    closeInstallModal();
    expect(isInstallModalOpen.value).toBe(false);
  });

  it('detects iPadOS 13+ desktop Safari via MacIntel platform and maxTouchPoints', () => {
    const originalPlatform = navigator.platform;
    const originalMaxTouchPoints = navigator.maxTouchPoints;

    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });

    const { isIosSafari } = usePwaInstall();
    expect(isIosSafari.value).toBe(true);

    // Restore
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalMaxTouchPoints,
      configurable: true,
    });
  });
});
