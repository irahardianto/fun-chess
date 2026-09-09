import type { LanInfoResponse } from '@fun-chess/shared';
import { logger } from '@/platform/telemetry';

export interface WindowLocationContext {
  protocol?: string;
  hostname?: string;
  port?: string;
  origin?: string;
}

export interface LobbyUrlBuilderOptions {
  lanInfo?: Partial<LanInfoResponse> | null;
  activeLanIp?: string | null;
  windowLocation?: WindowLocationContext | null;
  roomCode?: string;
  joinUrl?: string;
}

function resolveWindowLocation(
  override?: WindowLocationContext | null
): WindowLocationContext | null {
  if (override !== undefined) {
    return override;
  }
  if (typeof window !== 'undefined' && window.location) {
    return {
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      port: window.location.port,
      origin: window.location.origin,
    };
  }
  return null;
}

/**
 * Determines whether cloud relay/mode is currently active.
 */
export function isCloudRelayMode(
  options?: Pick<LobbyUrlBuilderOptions, 'lanInfo' | 'windowLocation'>
): boolean {
  const info = options?.lanInfo;
  const winLoc = resolveWindowLocation(options?.windowLocation);

  return Boolean(
    info?.isCloudRelay ||
    info?.relayMode === 'cloud' ||
    info?.publicUrl ||
    (winLoc && winLoc.protocol === 'https:')
  );
}

/**
 * Checks whether an address refers to local host loopback.
 */
export function isLocalhostAddress(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/**
 * Deterministically resolves the effective network host IP or domain name.
 */
export function resolveEffectiveHost(
  options?: LobbyUrlBuilderOptions & { isCloud?: boolean }
): string {
  const winLoc = resolveWindowLocation(options?.windowLocation);
  const info = options?.lanInfo;
  const isCloud = options?.isCloud ?? isCloudRelayMode(options);

  // 1. Manual user override or stored activeLanIp (only in LAN mode)
  if (
    !isCloud &&
    options?.activeLanIp &&
    options.activeLanIp !== '127.0.0.1' &&
    options.activeLanIp !== 'localhost'
  ) {
    return options.activeLanIp;
  }

  // 2. Cloud Relay publicUrl hostname
  if (isCloud && info?.publicUrl) {
    try {
      const urlObj = new URL(
        info.publicUrl.startsWith('http') ? info.publicUrl : `https://${info.publicUrl}`
      );
      return urlObj.hostname;
    } catch (err) {
      logger.debug('Failed to parse Cloud Relay publicUrl for QR host resolution', {
        operation: 'determine_host_for_qr',
        publicUrl: info.publicUrl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Window location if accessed via non-localhost hostname/domain directly
  if (
    winLoc?.hostname &&
    winLoc.hostname !== 'localhost' &&
    winLoc.hostname !== '127.0.0.1'
  ) {
    return winLoc.hostname;
  }

  // 4. Server-detected LAN IP
  if (info?.lanIp && info.lanIp !== '127.0.0.1' && info.lanIp !== 'localhost') {
    return info.lanIp;
  }

  return winLoc?.hostname || 'localhost';
}

/**
 * Deterministically resolves the effective network port string.
 * Returns empty string for standard ports (80, 443) or in cloud relay mode.
 */
export function resolveEffectivePort(
  options?: LobbyUrlBuilderOptions & { isCloud?: boolean }
): string {
  const winLoc = resolveWindowLocation(options?.windowLocation);
  const info = options?.lanInfo;
  const isCloud = options?.isCloud ?? isCloudRelayMode(options);

  if (isCloud) {
    return '';
  }

  if (winLoc) {
    if (winLoc.protocol === 'https:') {
      return '';
    }
    if (winLoc.port) {
      return winLoc.port === '80' || winLoc.port === '443' ? '' : winLoc.port;
    }
  }

  if (info?.isCloudRelay || info?.relayMode === 'cloud' || info?.publicUrl) {
    return '';
  }

  if (info?.port) {
    return info.port === 80 || info.port === 443 ? '' : String(info.port);
  }

  return '3000';
}

/**
 * Deterministically builds the base URL for the lobby.
 */
export function buildLobbyBaseUrl(options?: LobbyUrlBuilderOptions): string {
  const winLoc = resolveWindowLocation(options?.windowLocation);
  const info = options?.lanInfo;
  const isCloud = isCloudRelayMode(options);

  if (isCloud) {
    if (info?.publicUrl) {
      return info.publicUrl.replace(/\/+$/, '');
    }
    if (winLoc?.origin && winLoc.origin !== 'null') {
      return winLoc.origin.replace(/\/+$/, '');
    }
  }

  const host = resolveEffectiveHost({ ...options, isCloud });
  const port = resolveEffectivePort({ ...options, isCloud });
  const protocol = winLoc?.protocol || 'http:';
  const portPart = port ? `:${port}` : '';

  return `${protocol}//${host}${portPart}`;
}

/**
 * Deterministically builds the full join URL including query string for a room.
 */
export function buildLobbyJoinUrl(options?: LobbyUrlBuilderOptions): string {
  if (options?.joinUrl) {
    return options.joinUrl;
  }

  const baseUrl = buildLobbyBaseUrl(options);
  const roomCode = options?.roomCode?.trim();

  if (!roomCode) {
    return baseUrl;
  }

  return `${baseUrl}/?join=${encodeURIComponent(roomCode)}`;
}
