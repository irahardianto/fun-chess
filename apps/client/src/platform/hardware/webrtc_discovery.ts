/**
 * WebRTC local IPv4 discovery abstraction and test doubles.
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding MAJ-012.
 */

export interface IWebRtcDiscovery {
  /**
   * Attempts to discover the host's private IPv4 address via WebRTC ICE candidate inspection.
   *
   * @param timeoutMs - Maximum duration in milliseconds to wait for a candidate (defaults to 800ms)
   * @returns Discovered IPv4 address string or null if discovery failed/timed out
   */
  discoverLocalIp(timeoutMs?: number): Promise<string | null>;
}

/**
 * Production implementation using ephemeral RTCPeerConnection candidate inspection.
 */
export class BrowserWebRtcDiscovery implements IWebRtcDiscovery {
  public async discoverLocalIp(timeoutMs: number = 800): Promise<string | null> {
    if (
      typeof window === 'undefined' ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      return null;
    }

    return new Promise((resolve) => {
      let pc: RTCPeerConnection | null = null;
      let resolved = false;

      const cleanup = () => {
        if (pc) {
          try {
            pc.close();
          } catch {
            // Suppress close error on abort/timeout
          }
          pc = null;
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, timeoutMs);

      try {
        pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        pc.createOffer()
          .then((offer) => {
            if (!resolved && pc) {
              return pc.setLocalDescription(offer);
            }
          })
          .catch(() => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              cleanup();
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
            /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/
          );
          if (match && match[0]) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              cleanup();
              resolve(match[0]);
            }
          }
        };
      } catch {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve(null);
        }
      }
    });
  }
}

/**
 * Test double implementation returning a pre-configured IP or null.
 */
export class MockWebRtcDiscovery implements IWebRtcDiscovery {
  constructor(public ip: string | null = '192.168.1.100') {}

  public async discoverLocalIp(_timeoutMs?: number): Promise<string | null> {
    return this.ip;
  }
}

export const defaultWebRtcDiscovery: IWebRtcDiscovery = new BrowserWebRtcDiscovery();
