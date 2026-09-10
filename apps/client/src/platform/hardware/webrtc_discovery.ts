/**
 * WebRTC local IPv4 discovery abstraction and test doubles.
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding MAJ-012.
 */

import { logger as defaultLogger, type ILogger } from '../telemetry';

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
  constructor(private readonly logger: ILogger = defaultLogger) {}

  public async discoverLocalIp(timeoutMs: number = 800): Promise<string | null> {
    if (
      typeof window === 'undefined' ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      return null;
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.logger.debug('Starting WebRTC local IP discovery', {
      operation: 'webrtc_discover_ip',
      timeoutMs,
    });

    return new Promise((resolve) => {
      let pc: RTCPeerConnection | null = null;
      let resolved = false;

      const cleanup = () => {
        if (pc) {
          try {
            pc.close();
          } catch (err) {
            this.logger.debug('Failed to close RTCPeerConnection cleanly', {
              operation: 'webrtc_discover_ip',
              error: err instanceof Error ? err.message : String(err),
            });
          }
          pc = null;
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const duration = Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
          );
          const iceGatheringState = pc ? (pc.iceGatheringState ?? 'unknown') : 'unknown';
          this.logger.debug('WebRTC local IP discovery timed out', {
            operation: 'webrtc_discover_ip',
            iceGatheringState,
            duration,
          });
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
            return undefined;
          })
          .catch((err) => {
            this.logger.debug('WebRTC offer creation or local description failed', {
              operation: 'webrtc_discover_ip',
              error: err instanceof Error ? err.message : String(err),
            });
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
            /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/
          );
          if (match && match[0]) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              const duration = Math.round(
                (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
              );
              this.logger.debug('WebRTC local IP discovery succeeded', {
                operation: 'webrtc_discover_ip',
                ip: match[0],
                duration,
              });
              cleanup();
              resolve(match[0]);
            }
          }
        };
      } catch (err) {
        this.logger.debug('WebRTC initialization failed', {
          operation: 'webrtc_discover_ip',
          error: err instanceof Error ? err.message : String(err),
        });
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
