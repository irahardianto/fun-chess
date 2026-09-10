import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
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
    it('supports injected MockNetworkMonitor without touching browser globals', async () => {
      const { MockNetworkMonitor } = await import('../composables/useNetworkStatus');
      const mockMonitor = new MockNetworkMonitor(false);
      const status = useNetworkStatus(undefined, undefined, mockMonitor);

      expect(status.isOnline.value).toBe(false);
      expect(status.isOffline.value).toBe(true);

      mockMonitor.setOnlineStatus(true);
      expect(status.isOnline.value).toBe(true);
      expect(status.isOffline.value).toBe(false);
    });
  });
});
