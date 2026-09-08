import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import { useNetworkStatus, resetNetworkStatusState } from '../useNetworkStatus';

describe('useNetworkStatus composable', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
  });

  it('initializes isOnline to true when navigator.onLine is true', () => {
    // Arrange
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    // Act
    const scope = effectScope();
    let status: ReturnType<typeof useNetworkStatus> | undefined;
    scope.run(() => {
      status = useNetworkStatus();
    });

    // Assert
    expect(status?.isOnline.value).toBe(true);
    expect(status?.isOffline.value).toBe(false);
    scope.stop();
  });

  it('initializes isOnline to false when navigator.onLine is false', () => {
    // Arrange
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    // Act
    const scope = effectScope();
    let status: ReturnType<typeof useNetworkStatus> | undefined;
    scope.run(() => {
      status = useNetworkStatus();
    });

    // Assert
    expect(status?.isOnline.value).toBe(false);
    expect(status?.isOffline.value).toBe(true);
    scope.stop();
  });

  it('reactively transitions isOnline from true to false when offline event fires on window', () => {
    // Arrange
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

    // Act
    window.dispatchEvent(new Event('offline'));

    // Assert
    expect(status?.isOnline.value).toBe(false);
    expect(status?.isOffline.value).toBe(true);
    scope.stop();
  });

  it('reactively transitions isOnline from false to true when online event fires on window', () => {
    // Arrange
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

    // Act
    window.dispatchEvent(new Event('online'));

    // Assert
    expect(status?.isOnline.value).toBe(true);
    expect(status?.isOffline.value).toBe(false);
    scope.stop();
  });

  it('removes window event listeners on scope disposal to prevent memory leaks', () => {
    // Arrange
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const scope = effectScope();
    let status: ReturnType<typeof useNetworkStatus> | undefined;
    scope.run(() => {
      status = useNetworkStatus();
    });

    // Act
    scope.stop();

    // Assert
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    // Verify subsequent events do not modify state after disposal
    const lastOnline = status?.isOnline.value;
    window.dispatchEvent(new Event('offline'));
    expect(status?.isOnline.value).toBe(lastOnline);
  });

  describe('resetNetworkStatusState hook [MAJ-011]', () => {
    it('cleans up state and removes global window listeners between tests', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const status1 = useNetworkStatus();

      // Trigger offline event
      window.dispatchEvent(new Event('offline'));
      expect(status1.isOnline.value).toBe(false);

      // Invoke reset hook
      expect(typeof resetNetworkStatusState).toBe('function');
      resetNetworkStatusState();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      // After reset, fresh composable picks up navigator.onLine
      const status2 = useNetworkStatus();
      expect(status2.isOnline.value).toBe(true);
    });
  });
});
