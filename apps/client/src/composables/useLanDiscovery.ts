import { ref, onMounted, getCurrentInstance } from 'vue';
import type { LanInfoResponse } from '@fun-chess/shared';
import { safeLocalStorage, createSafeStorage, type KeyValueStorage } from '../platform/storage';
import { apiClient, type IApiClient } from '../platform/api';
import { logger } from '../platform/telemetry';
import {
  type IWebRtcDiscovery,
  defaultWebRtcDiscovery,
} from '../platform/hardware';

const STORAGE_KEY = 'fun_chess_lan_ip';

/**
 * Attempts to detect local IPv4 address via WebRTC ICE candidate gathering.
 * Delegates to IWebRtcDiscovery hardware abstraction (Rule 1: I/O Isolation).
 */
export async function detectWebRtcLanIp(
  discovery: IWebRtcDiscovery = defaultWebRtcDiscovery
): Promise<string | null> {
  return discovery.discoverLocalIp();
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
  webRtcDiscovery?: IWebRtcDiscovery;
}

export function useLanDiscovery(options: LanDiscoveryOptions = {}) {
  const storage =
    options.storage ??
    (safeLocalStorage.isAvailable() ? safeLocalStorage : createSafeStorage('localStorage'));
  const client = options.apiClient ?? apiClient;
  const webRtc = options.webRtcDiscovery ?? defaultWebRtcDiscovery;

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
      logger.warn('Failed to read saved LAN IP from storage', {
        operation: 'lan_storage_read',
        error: err instanceof Error ? err.message : String(err),
      });
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
      logger.warn('Failed to fetch server LAN info (offline mode)', {
        operation: 'lan_fetch_info',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 3. If still localhost/empty, attempt WebRTC client discovery
    if (!activeLanIp.value || activeLanIp.value === '127.0.0.1') {
      const webrtcIp = await detectWebRtcLanIp(webRtc);
      if (webrtcIp) {
        detectedWebRtcIp.value = webrtcIp;
        activeLanIp.value = webrtcIp;
        try {
          storage.setItem(STORAGE_KEY, webrtcIp);
        } catch (err) {
          logger.warn('Failed to cache WebRTC LAN IP to storage', {
            operation: 'lan_storage_cache',
            error: err instanceof Error ? err.message : String(err),
          });
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
      logger.warn('Failed to persist LAN IP in storage', {
        operation: 'lan_storage_persist',
        error: err instanceof Error ? err.message : String(err),
      });
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
