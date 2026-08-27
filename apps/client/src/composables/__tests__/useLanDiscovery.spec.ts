import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useLanDiscovery, isValidIPv4 } from '../useLanDiscovery';

describe('useLanDiscovery composable', () => {
  let mockStorage: Record<string, string> = {};

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
    if (typeof window !== 'undefined') {
      vi.stubGlobal('window', {
        ...window,
        localStorage: storageMock,
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates IPv4 strings correctly', () => {
    expect(isValidIPv4('192.168.1.1')).toBe(true);
    expect(isValidIPv4('10.0.0.5')).toBe(true);
    expect(isValidIPv4('172.16.0.1')).toBe(true);
    expect(isValidIPv4('127.0.0.1')).toBe(true);
    expect(isValidIPv4('localhost')).toBe(false);
    expect(isValidIPv4('999.999.999.999')).toBe(false);
    expect(isValidIPv4('192.168.1')).toBe(false);
    expect(isValidIPv4('')).toBe(false);
  });

  it('persists manual LAN IP to localStorage and updates activeLanIp', () => {
    const { activeLanIp, setLanIp } = useLanDiscovery();
    setLanIp('192.168.1.55');

    expect(activeLanIp.value).toBe('192.168.1.55');
    expect(localStorage.getItem('fun_chess_lan_ip')).toBe('192.168.1.55');
  });

  it('initializes from localStorage if valid IP is cached', async () => {
    localStorage.setItem('fun_chess_lan_ip', '192.168.1.88');
    const { activeLanIp, init } = useLanDiscovery();
    await init();

    expect(activeLanIp.value).toBe('192.168.1.88');
  });

  it('fetches server LAN discovery from /api/lan-info and populates state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          lanIp: '192.168.1.150',
          port: 3000,
          isCloudRelay: false,
        }),
      })
    );

    const { serverLanInfo, activeLanIp, init, isLoaded } = useLanDiscovery();
    await init();

    expect(isLoaded.value).toBe(true);
    expect(serverLanInfo.value?.lanIp).toBe('192.168.1.150');
    expect(activeLanIp.value).toBe('192.168.1.150');
  });

  it('gracefully handles fetch failure (offline mode) without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network offline')));

    const { serverLanInfo, activeLanIp, init, isLoaded } = useLanDiscovery();
    await init();

    expect(isLoaded.value).toBe(true);
    expect(serverLanInfo.value).toBeNull();
    expect(activeLanIp.value).toBe('');
  });

  it('clears activeLanIp and removes from localStorage when empty string is provided', () => {
    const { activeLanIp, setLanIp } = useLanDiscovery();
    setLanIp('192.168.1.200');
    expect(activeLanIp.value).toBe('192.168.1.200');

    setLanIp('');
    expect(activeLanIp.value).toBe('');
    expect(localStorage.getItem('fun_chess_lan_ip')).toBeNull();
  });

  it('detects LAN IP via WebRTC ICE candidate gathering', async () => {
    class MockRTCPeerConnection {
      onicecandidate: ((event: any) => void) | null = null;
      createDataChannel() {}
      async createOffer() {
        return {};
      }
      async setLocalDescription() {
        // Trigger icecandidate with candidate string containing LAN IP
        setTimeout(() => {
          if (this.onicecandidate) {
            this.onicecandidate({
              candidate: {
                candidate: 'candidate:1 1 UDP 2130706431 192.168.1.199 54321 typ host',
              },
            });
          }
        }, 10);
      }
      close() {}
    }

    vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection);

    const { activeLanIp, detectedWebRtcIp, init } = useLanDiscovery();
    await init();

    expect(detectedWebRtcIp.value).toBe('192.168.1.199');
    expect(activeLanIp.value).toBe('192.168.1.199');
  });
});
