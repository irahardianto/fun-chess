import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useNetworkStatus } from '../composables/useNetworkStatus';

describe('useNetworkStatus Composable', () => {
  beforeEach(() => {
    // Reset online status to true
    const { setOnlineStatus } = useNetworkStatus();
    setOnlineStatus(true);
  });

  afterEach(() => {
    const { setOnlineStatus } = useNetworkStatus();
    setOnlineStatus(true);
  });

  it('initializes with online state and reassuring text', () => {
    const { isOnline, isOffline, offlineHeadline, offlineSubtext, offlineTitle } =
      useNetworkStatus();

    expect(isOnline.value).toBe(true);
    expect(isOffline.value).toBe(false);
    expect(offlineHeadline.value).toBe('Playing 100% Offline! ✨');
    expect(offlineSubtext.value).toBe('Puzzles, Academy & AI Bots work anywhere!');
    expect(offlineTitle.value).toBe('Offline Ready');
  });

  it('updates state when window offline and online events fire', () => {
    const { isOnline, isOffline } = useNetworkStatus();

    window.dispatchEvent(new Event('offline'));
    expect(isOnline.value).toBe(false);
    expect(isOffline.value).toBe(true);

    window.dispatchEvent(new Event('online'));
    expect(isOnline.value).toBe(true);
    expect(isOffline.value).toBe(false);
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
});
