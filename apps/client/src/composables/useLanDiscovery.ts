import { ref, onMounted, getCurrentInstance } from 'vue';
import type { LanInfoResponse } from '@fun-chess/shared';
import { safeLocalStorage, createSafeStorage, type KeyValueStorage } from '../platform/storage';
import { apiClient, type IApiClient } from '../platform/api';

const STORAGE_KEY = 'fun_chess_lan_ip';

/**
 * Attempts to detect local IPv4 address via WebRTC ICE candidate gathering.
 */
export async function detectWebRtcLanIp(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            pc.close();
          } catch (err) {
            console.warn('[useLanDiscovery] Failed to close RTCPeerConnection on timeout:', err);
          }
          resolve(null);
        }
      }, 800);

      pc.createDataChannel('');
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((err) => {
          console.warn('[useLanDiscovery] Failed to set WebRTC local description:', err);
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            try {
              pc.close();
            } catch (closeErr) {
              console.warn('[useLanDiscovery] Failed to close RTCPeerConnection on offer error:', closeErr);
            }
            resolve(null);
          }
        });

      pc.onicecandidate = (event) => {
        if (!event || !event.candidate || !event.candidate.candidate) {
          return;
        }

        const candidate = event.candidate.candidate;
        // Search for private IPv4 patterns (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        const match = candidate.match(
          /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/
        );
        if (match && match[0]) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            try {
              pc.close();
            } catch (err) {
              console.warn('[useLanDiscovery] Failed to close RTCPeerConnection on candidate found:', err);
            }
            resolve(match[0]);
          }
        }
      };
    } catch (err) {
      console.warn('[useLanDiscovery] Failed to initialize WebRTC LAN discovery:', err);
      resolve(null);
    }
  });
}

export function isValidIPv4(ip: string): boolean {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

export interface LanDiscoveryOptions {
  storage?: KeyValueStorage;
  apiClient?: IApiClient;
}

export function useLanDiscovery(options: LanDiscoveryOptions = {}) {
  const storage =
    options.storage ??
    (safeLocalStorage.isAvailable() ? safeLocalStorage : createSafeStorage('localStorage'));
  const client = options.apiClient ?? apiClient;

  const serverLanInfo = ref<LanInfoResponse | null>(null);
  const activeLanIp = ref<string>('');
  const detectedWebRtcIp = ref<string>('');
  const isLoaded = ref(false);

  // Initialize from storage or fetch from server / WebRTC
  async function init() {
    // 1. Check storage first
    try {
      const saved = storage.getItem(STORAGE_KEY);
      if (saved && isValidIPv4(saved) && saved !== '127.0.0.1') {
        activeLanIp.value = saved;
      }
    } catch (err) {
      console.warn('[useLanDiscovery] Failed to read saved LAN IP from storage:', err);
    }

    // 2. Fetch server LAN discovery
    try {
      const data = await client.getLanInfo();
      serverLanInfo.value = data;
      if (
        !activeLanIp.value &&
        data.lanIp &&
        data.lanIp !== '127.0.0.1' &&
        data.lanIp !== 'localhost'
      ) {
        activeLanIp.value = data.lanIp;
      }
    } catch (err) {
      console.warn('[useLanDiscovery] Failed to fetch server LAN info (offline mode):', err);
    }

    // 3. If still localhost/empty, attempt WebRTC client discovery
    if (!activeLanIp.value || activeLanIp.value === '127.0.0.1') {
      const webrtcIp = await detectWebRtcLanIp();
      if (webrtcIp) {
        detectedWebRtcIp.value = webrtcIp;
        activeLanIp.value = webrtcIp;
        try {
          storage.setItem(STORAGE_KEY, webrtcIp);
        } catch (err) {
          console.warn('[useLanDiscovery] Failed to cache WebRTC LAN IP to storage:', err);
        }
      }
    }

    isLoaded.value = true;
  }

  function setLanIp(ip: string) {
    const trimmed = ip.trim();
    activeLanIp.value = trimmed;
    try {
      if (trimmed && isValidIPv4(trimmed) && trimmed !== '127.0.0.1') {
        storage.setItem(STORAGE_KEY, trimmed);
      } else if (!trimmed) {
        storage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn('[useLanDiscovery] Failed to persist LAN IP in storage:', err);
    }
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      init();
    });
  }

  return {
    serverLanInfo,
    activeLanIp,
    detectedWebRtcIp,
    isLoaded,
    init,
    setLanIp,
  };
}
