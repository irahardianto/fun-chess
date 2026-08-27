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

    const { setDeferredPrompt, setInstalled, resetSnooze } = usePwaInstall();
    setDeferredPrompt(null);
    setInstalled(false);
    resetSnooze();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures beforeinstallprompt event and updates canInstall & showInstallBanner', () => {
    const { canInstall, showInstallBanner, setDeferredPrompt } = usePwaInstall();

    expect(canInstall.value).toBe(false);
    expect(showInstallBanner.value).toBe(false);

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    setDeferredPrompt(mockPromptEvent);

    expect(canInstall.value).toBe(true);
    expect(showInstallBanner.value).toBe(true);
  });

  it('snoozes install prompt for specified days in localStorage', () => {
    const { showInstallBanner, setDeferredPrompt, snoozePrompt, isSnoozed, resetSnooze } =
      usePwaInstall();

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    } as unknown as BeforeInstallPromptEvent;

    setDeferredPrompt(mockPromptEvent);
    expect(showInstallBanner.value).toBe(true);

    snoozePrompt(7);
    expect(isSnoozed.value).toBe(true);
    expect(showInstallBanner.value).toBe(false);

    const storedSnooze = mockStorage[SNOOZE_STORAGE_KEY];
    expect(storedSnooze).toBeDefined();
    expect(Number(storedSnooze)).toBeGreaterThan(Date.now());

    resetSnooze();
    expect(isSnoozed.value).toBe(false);
    expect(showInstallBanner.value).toBe(true);
  });

  it('executes promptInstall successfully when deferredPrompt is available', async () => {
    const { setDeferredPrompt, promptInstall, isInstalled } = usePwaInstall();

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
  });

  it('opens modal for iOS or manual trigger', () => {
    const { isInstallModalOpen, openInstallModal, closeInstallModal } = usePwaInstall();

    expect(isInstallModalOpen.value).toBe(false);
    openInstallModal();
    expect(isInstallModalOpen.value).toBe(true);
    closeInstallModal();
    expect(isInstallModalOpen.value).toBe(false);
  });
});
