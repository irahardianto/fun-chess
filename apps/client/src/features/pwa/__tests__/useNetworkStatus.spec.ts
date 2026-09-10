import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import { MockNetworkMonitor } from '@/platform/browser/testing';
import { useNetworkStatus, resetNetworkStatusState } from '../composables/useNetworkStatus';

describe('useNetworkStatus Composable', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
    resetNetworkStatusState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetNetworkStatusState();
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
  });

  it('initializes with online state and kid-friendly reassuring text when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    const scope = effectScope();
    let status: ReturnType<typeof useNetworkStatus> | undefined;
    scope.run(() => {
      status = useNetworkStatus();
    });

    expect(status?.isOnline.value).toBe(true);
    expect(status?.isOffline.value).toBe(false);
    expect(status?.offlineHeadline.value).toBe('Playing 100% Offline! ✨');
    expect(status?.offlineSubtext.value).toBe('Puzzles, Academy & AI Bots work anywhere!');
    expect(status?.offlineMessage.value).toBe('Playing 100% Offline! Puzzles, Academy & AI Bots work anywhere! ✨');
    expect(status?.offlineTitle.value).toBe('Offline Ready');
    scope.stop();
  });

  it('initializes isOnline to false when navigator.onLine is false', () => {
    resetNetworkStatusState();
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    const scope = effectScope();
    let status: ReturnType<typeof useNetworkStatus> | undefined;
    scope.run(() => {
      status = useNetworkStatus();
    });

    expect(status?.isOnline.value).toBe(false);
    expect(status?.isOffline.value).toBe(true);
    scope.stop();
  });

  it('reactively transitions isOnline from true to false when offline event fires on window', () => {
    const scope = effectScope();
    let status: ReturnType<typeof useNetworkStatus> | undefined;
    scope.run(() => {
      status = useNetworkStatus();
    });

    expect(status?.isOnline.value).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(status?.isOnline.value).toBe(false);
    expect(status?.isOffline.value).toBe(true);

    window.dispatchEvent(new Event('online'));
    expect(status?.isOnline.value).toBe(true);
    expect(status?.isOffline.value).toBe(false);
    scope.stop();
  });

  it('allows manual override with setOnlineStatus', () => {
    const { isOnline, isOffline, setOnlineStatus } = useNetworkStatus();

    setOnlineStatus(false);
    expect(isOnline.value).toBe(false);
    expect(isOffline.value).toBe(true);

    setOnlineStatus(true);
    expect(isOnline.value).toBe(true);
    expect(isOffline.value).toBe(false);
  });

  it('performs active checkConnectivity probe when invoked', async () => {
    const { checkConnectivity, isOnline } = useNetworkStatus();

    // Mock fetch success
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true }) as Response;

    const result = await checkConnectivity('/favicon.svg');
    expect(result).toBe(true);
    expect(isOnline.value).toBe(true);

    // Mock fetch network failure
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };

    const failResult = await checkConnectivity('/favicon.svg');
    expect(failResult).toBe(false);
    expect(isOnline.value).toBe(false);

    globalThis.fetch = originalFetch;
  });

  it('removes window event listeners on scope disposal to prevent memory leaks', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const scope = effectScope();
    let status: ReturnType<typeof useNetworkStatus> | undefined;
    scope.run(() => {
      status = useNetworkStatus();
    });

    scope.stop();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    const lastOnline = status?.isOnline.value;
    window.dispatchEvent(new Event('offline'));
    expect(status?.isOnline.value).toBe(lastOnline);
  });

  describe('resetNetworkStatusState hook [MAJ-011]', () => {
    it('cleans up state and removes global window listeners between tests', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const status1 = useNetworkStatus();

      window.dispatchEvent(new Event('offline'));
      expect(status1.isOnline.value).toBe(false);

      expect(typeof resetNetworkStatusState).toBe('function');
      resetNetworkStatusState();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      const status2 = useNetworkStatus();
      expect(status2.isOnline.value).toBe(true);
    });
  });

  describe('MockNetworkMonitor & DI abstraction [MAJ-011]', () => {
    it('supports injected MockNetworkMonitor without touching browser globals', () => {
      const mockMonitor = new MockNetworkMonitor(false);
      const status = useNetworkStatus({ monitor: mockMonitor });

      expect(status.isOnline.value).toBe(false);
      expect(status.isOffline.value).toBe(true);

      mockMonitor.setOnlineStatus(true);
      expect(status.isOnline.value).toBe(true);
      expect(status.isOffline.value).toBe(false);
    });

    it('supports legacy positional arguments for backwards compatibility', () => {
      const mockMonitor = new MockNetworkMonitor(false);
      const status = useNetworkStatus(undefined, undefined, mockMonitor);

      expect(status.isOnline.value).toBe(false);
      expect(status.isOffline.value).toBe(true);

      mockMonitor.setOnlineStatus(true);
      expect(status.isOnline.value).toBe(true);
      expect(status.isOffline.value).toBe(false);
    });

    it('supports custom logger via options', () => {
      const mockMonitor = new MockNetworkMonitor(false);
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };
      useNetworkStatus({ monitor: mockMonitor, logger: mockLogger as any });
      mockMonitor.setOnlineStatus(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Network status changed to online', {
        operation: 'network_status_change',
        isOnline: true,
      });
    });

    it('supports custom client via options', async () => {
      const mockClient = {
        get: vi.fn(),
        getLanInfo: vi.fn(),
        checkHealth: vi.fn(),
        checkConnectivity: vi.fn().mockResolvedValue(true),
      };
      const status = useNetworkStatus({ client: mockClient as any });
      const online = await status.checkConnectivity('/test');
      expect(online).toBe(true);
      expect(mockClient.checkConnectivity).toHaveBeenCalledWith('/test');
    });

    it('setOnlineStatus delegates to mutable monitor', () => {
      const mockMonitor = new MockNetworkMonitor(true);
      const status = useNetworkStatus({ monitor: mockMonitor });
      status.setOnlineStatus(false);
      expect(status.isOnline.value).toBe(false);
      expect(mockMonitor.isOnline()).toBe(false);
    });
  });
});
