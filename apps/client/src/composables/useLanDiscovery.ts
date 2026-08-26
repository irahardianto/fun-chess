import { ref, onMounted, getCurrentInstance } from 'vue';
import type { LanInfoResponse } from '@fun-chess/shared';

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

      pc.createDataChannel('');
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => resolve(null));

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            pc.close();
          } catch {
            // ignore
          }
          resolve(null);
        }
      }, 800);

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
            } catch {
              // ignore
            }
            resolve(match[0]);
          }
        }
      };
    } catch {
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

export function useLanDiscovery() {
  const serverLanInfo = ref<LanInfoResponse | null>(null);
  const activeLanIp = ref<string>('');
  const detectedWebRtcIp = ref<string>('');
  const isLoaded = ref(false);

  // Initialize from storage or fetch from server / WebRTC
  async function init() {
    // 1. Check localStorage first
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && isValidIPv4(saved) && saved !== '127.0.0.1') {
        activeLanIp.value = saved;
      }
    }

    // 2. Fetch server LAN discovery
    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/api/lan-info');
        if (res.ok) {
          const data: LanInfoResponse = await res.json();
          serverLanInfo.value = data;
          if (
            !activeLanIp.value &&
            data.lanIp &&
            data.lanIp !== '127.0.0.1' &&
            data.lanIp !== 'localhost'
          ) {
            activeLanIp.value = data.lanIp;
          }
        }
      } catch {
        // Offline mode
      }
    }

    // 3. If still localhost/empty, attempt WebRTC client discovery
    if (!activeLanIp.value || activeLanIp.value === '127.0.0.1') {
      const webrtcIp = await detectWebRtcLanIp();
      if (webrtcIp) {
        detectedWebRtcIp.value = webrtcIp;
        activeLanIp.value = webrtcIp;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, webrtcIp);
        }
      }
    }

    isLoaded.value = true;
  }

  function setLanIp(ip: string) {
    const trimmed = ip.trim();
    activeLanIp.value = trimmed;
    if (typeof localStorage !== 'undefined') {
      if (trimmed && isValidIPv4(trimmed) && trimmed !== '127.0.0.1') {
        localStorage.setItem(STORAGE_KEY, trimmed);
      } else if (!trimmed) {
        localStorage.removeItem(STORAGE_KEY);
      }
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
