import os, { NetworkInterfaceInfo } from "node:os";
import {
  type LanInfoResponse,
  serializeError,
} from "@fun-chess/shared";
import { Logger } from "../../platform/logger/index.js";

export type { LanInfoResponse };

/**
 * Abstraction provider for operating system network interface discovery.
 * Enables deterministic testing and eliminates direct OS coupling (MAJ-016).
 */
export interface INetworkInterfaceProvider {
  /**
   * Returns a dictionary of network interfaces indexed by interface name.
   */
  getNetworkInterfaces(): NodeJS.Dict<NetworkInterfaceInfo[]>;
}

/**
 * Production implementation backed by node:os.networkInterfaces().
 */
export class SystemNetworkInterfaceProvider
  implements INetworkInterfaceProvider
{
  public getNetworkInterfaces(): NodeJS.Dict<NetworkInterfaceInfo[]> {
    return os.networkInterfaces();
  }
}

/**
 * In-memory implementation holding static network interfaces for unit testing.
 */
export class StaticNetworkInterfaceProvider
  implements INetworkInterfaceProvider
{
  constructor(
    private readonly interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {},
  ) {}

  public getNetworkInterfaces(): NodeJS.Dict<NetworkInterfaceInfo[]> {
    return this.interfaces;
  }
}

/**
 * Configuration options for RelayAddressService.
 */
export interface RelayAddressConfig {
  /** Override URL for Cloud Run / reverse proxy deployments (e.g. "https://fun-chess-xyz.a.run.app") */
  readonly publicUrl?: string;
  /** Listening host binding (default: "0.0.0.0") */
  readonly host?: string;
  /** Listening port (default: 3000) */
  readonly port?: number;
  /** Optional manual LAN IP override */
  readonly lanIp?: string;
  /** Optional manual Host IP override */
  readonly hostIp?: string;
  /** Optional logger for diagnostics (ENH-005) */
  readonly logger?: Logger;
  /** Optional network interface provider (defaults to SystemNetworkInterfaceProvider) (MAJ-016) */
  readonly networkInterfaceProvider?: INetworkInterfaceProvider;
  /** Optional flag to suppress internal network interfaces in cloud relay mode (MAJ-013, MIN-004) */
  readonly suppressCloudInterfaces?: boolean;
}

/**
 * Interface contract for RelayAddressService to enable I/O isolation and test mocking.
 * Updated to eliminate leaked test parameters (MAJ-016) and support tracing (ENH-008).
 */
export interface IRelayAddressService {
  /**
   * Resolves comprehensive LAN / Cloud addressing info.
   */
  getAddressingInfo(port?: number, correlationId?: string): LanInfoResponse;

  /**
   * Generates a game room invitation URL for QR code generation or player sharing.
   */
  generateJoinUrl(
    port?: number,
    roomCode?: string,
    correlationId?: string,
  ): string;

  /**
   * Checks whether the current instance is configured as a public Cloud relay.
   */
  isCloudRelay(): boolean;

  /**
   * Returns the primary LAN IP or public hostname.
   */
  getLocalLanIp(correlationId?: string): string;

  /**
   * Retrieves all detected physical/configured IPv4 interfaces.
   */
  getAllLanInterfaces(correlationId?: string): string[];
}

/**
 * Normalizes a public URL string by stripping trailing slashes and omitting standard ports.
 *
 * @param rawUrl - Raw URL string (e.g. "https://fun-chess.a.run.app/" or "http://example.com:80")
 * @param logger - Optional logger for structured diagnostics (ENH-005)
 * @param correlationId - Optional correlation ID for distributed tracing (ENH-008)
 * @returns Normalized URL string
 */
export function normalizePublicUrl(
  rawUrl: string,
  logger?: Logger,
  correlationId?: string,
): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    const urlObj = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
    const protocol = urlObj.protocol.toLowerCase();
    const hostname = urlObj.hostname;
    const port = urlObj.port;
    const pathname =
      urlObj.pathname === "/" ? "" : urlObj.pathname.replace(/\/+$/, "");

    // Omit default ports: 80 for http, 443 for https
    const isDefaultHttp =
      protocol === "http:" && (port === "80" || port === "");
    const isDefaultHttps =
      protocol === "https:" && (port === "443" || port === "");
    const portSuffix =
      isDefaultHttp || isDefaultHttps || !port ? "" : `:${port}`;

    return `${protocol}//${hostname}${portSuffix}${pathname}`;
  } catch (error) {
    logger?.debug(
      "Failed to normalize public URL, falling back to trimmed string",
      {
        operation: "normalize_public_url",
        correlationId,
        rawUrl: trimmed,
        error: serializeError(error),
      },
    );
    return trimmed.replace(/\/+$/, "");
  }
}

/**
 * Extracts the hostname or domain from a public URL string.
 *
 * @param publicUrl - Public URL string
 * @param logger - Optional logger for structured diagnostics (ENH-005)
 * @param correlationId - Optional correlation ID for distributed tracing (ENH-008)
 * @returns Hostname string or fallback to raw string
 */
export function extractHostnameFromUrl(
  publicUrl: string,
  logger?: Logger,
  correlationId?: string,
): string {
  const trimmed = publicUrl.trim();
  if (!trimmed) {
    return "127.0.0.1";
  }

  try {
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    const urlObj = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
    return urlObj.hostname || trimmed;
  } catch (error) {
    logger?.debug("Failed to parse hostname from URL, using regex fallback", {
      operation: "extract_hostname_from_url",
      correlationId,
      rawUrl: trimmed,
      error: serializeError(error),
    });
    return trimmed.replace(/^https?:\/\//i, "").split(/[:/]/)[0] || "127.0.0.1";
  }
}

/**
 * Service for intelligent cloud/container-aware host discovery, LAN interface resolution,
 * and game room join URL generation.
 */
export class RelayAddressService implements IRelayAddressService {
  private readonly networkInterfaceProvider: INetworkInterfaceProvider;

  constructor(private readonly config: RelayAddressConfig = {}) {
    this.networkInterfaceProvider =
      config.networkInterfaceProvider ?? new SystemNetworkInterfaceProvider();
  }

  /**
   * Checks whether the service is operating in Cloud Relay mode.
   * Returns true if publicUrl is configured in constructor config.
   */
  public isCloudRelay(): boolean {
    const publicUrl = this.config.publicUrl;
    return Boolean(publicUrl && publicUrl.trim().length > 0);
  }

  /**
   * Returns the normalized public base URL if configured, or undefined.
   */
  public getPublicUrl(correlationId?: string): string | undefined {
    const publicUrl = this.config.publicUrl;
    if (!publicUrl || !publicUrl.trim()) {
      return undefined;
    }
    return normalizePublicUrl(publicUrl, this.config.logger, correlationId);
  }

  /**
   * Retrieves all non-internal IPv4 network interface addresses.
   * Includes manual LAN IP overrides if configured.
   */
  public getAllLanInterfaces(correlationId?: string): string[] {
    const addresses: string[] = [];

    const manualIp = this.config.lanIp ?? this.config.hostIp;
    if (manualIp && manualIp.trim()) {
      const trimmedIp = manualIp.trim();
      if (!addresses.includes(trimmedIp)) {
        addresses.push(trimmedIp);
      }
    }

    let interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>;
    try {
      interfaces = this.networkInterfaceProvider.getNetworkInterfaces();
    } catch (err) {
      this.config.logger?.warn(
        "Failed to retrieve network interfaces from provider, falling back to localhost",
        {
          operation: "get_all_lan_interfaces",
          correlationId,
          error: serializeError(err),
        },
      );
      if (!addresses.includes("127.0.0.1")) {
        addresses.push("127.0.0.1");
      }
      return addresses;
    }

    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (!netList) continue;

      for (const net of netList) {
        // Skip internal (127.0.0.1) and non-IPv4 addresses
        if (net.family === "IPv4" && !net.internal) {
          if (!addresses.includes(net.address)) {
            addresses.push(net.address);
          }
        }
      }
    }

    this.config.logger?.debug("Retrieved LAN network interfaces", {
      operation: "get_all_lan_interfaces",
      correlationId,
      interfaceCount: addresses.length,
    });

    return addresses;
  }

  /**
   * Discovers the best local LAN IPv4 address or public hostname.
   * Priority Order:
   * 1. Public Cloud Relay hostname (if isCloudRelay is true)
   * 2. Manual LAN IP override (config.lanIp or process.env.LAN_IP / HOST_IP)
   * 3. Discovered local IPv4 interface (192.168.x.x -> 10.x.x.x -> 172.16-31.x.x -> first address)
   * 4. Fallback to 127.0.0.1
   */
  public getLocalLanIp(correlationId?: string): string {
    // 1. Cloud Relay Priority
    if (this.isCloudRelay()) {
      const publicUrl = this.getPublicUrl(correlationId);
      if (publicUrl) {
        return extractHostnameFromUrl(
          publicUrl,
          this.config.logger,
          correlationId,
        );
      }
    }

    // 2. Manual IP Override
    const manualIp = this.config.lanIp ?? this.config.hostIp;
    if (manualIp && manualIp.trim()) {
      return manualIp.trim();
    }

    // 3. Discovered local IPv4 interface
    const addresses = this.getAllLanInterfaces(correlationId);

    if (addresses.length === 0) {
      return "127.0.0.1";
    }

    // Priority a: 192.168.x.x
    const preferred = addresses.find((ip) => ip.startsWith("192.168."));
    if (preferred) return preferred;

    // Priority b: 10.x.x.x
    const tenNet = addresses.find((ip) => ip.startsWith("10."));
    if (tenNet) return tenNet;

    // Priority c: 172.16.x.x - 172.31.x.x
    const oneSevenTwo = addresses.find((ip) => {
      const match = /^172\.(\d+)\./.exec(ip);
      if (!match || !match[1]) return false;
      const secondOctet = parseInt(match[1], 10);
      return secondOctet >= 16 && secondOctet <= 31;
    });
    if (oneSevenTwo) return oneSevenTwo;

    // Priority d: First non-internal address or fallback
    const firstAddress = addresses[0];
    return firstAddress ?? "127.0.0.1";
  }

  /**
   * Generates a join URL for players on the LAN or remote cloud relay.
   *
   * @param port - Port number (default: configured port or 3000)
   * @param roomCode - Optional room code to encode into query string
   * @param correlationId - Optional correlation ID for tracing
   */
  public generateJoinUrl(
    port?: number,
    roomCode?: string,
    correlationId?: string,
  ): string {
    const effectivePort = port ?? this.config.port ?? 3000;

    let base: string;

    if (this.isCloudRelay()) {
      base = this.getPublicUrl(correlationId)!;
    } else {
      const lanIp = this.getLocalLanIp(correlationId);
      const portSuffix = effectivePort === 80 ? "" : `:${effectivePort}`;
      base = `http://${lanIp}${portSuffix}`;
    }

    if (roomCode && roomCode.trim()) {
      return `${base}?room=${encodeURIComponent(roomCode.trim().toUpperCase())}`;
    }

    return base;
  }

  /**
   * Generates comprehensive LAN / Cloud addressing info response structure.
   *
   * @param port - Active listening port
   * @param correlationId - Optional correlation ID for tracing (ENH-008)
   */
  public getAddressingInfo(
    port?: number,
    correlationId?: string,
  ): LanInfoResponse {
    const effectivePort = port ?? this.config.port ?? 3000;
    const lanIp = this.getLocalLanIp(correlationId);
    const rawInterfaces = this.getAllLanInterfaces(correlationId);
    const interfaces = rawInterfaces.length > 0 ? rawInterfaces : [lanIp];
    const localUrl = `http://localhost:${effectivePort}`;

    if (this.isCloudRelay()) {
      const publicUrl = this.getPublicUrl(correlationId)!;
      const joinUrl = publicUrl;

      // In cloud relay mode, suppress internal network topology (MIN-004) unless explicitly configured otherwise (MAJ-013).
      const shouldSuppress = this.config.suppressCloudInterfaces ?? true;
      const cloudInterfaces = shouldSuppress ? [] : interfaces;

      this.config.logger?.debug("Resolved Cloud Relay addressing info", {
        operation: "get_addressing_info",
        correlationId,
        relayMode: "cloud",
        publicUrl,
        interfaceCount: cloudInterfaces.length,
      });

      return {
        lanIp,
        port: effectivePort,
        localUrl,
        joinUrl,
        interfaces: cloudInterfaces,
        relayMode: "cloud",
        isCloudRelay: true,
        publicUrl,
      };
    }

    const joinUrl = this.generateJoinUrl(
      effectivePort,
      undefined,
      correlationId,
    );

    this.config.logger?.debug("Resolved LAN addressing info", {
      operation: "get_addressing_info",
      correlationId,
      relayMode: "lan",
      lanIp,
      port: effectivePort,
      interfaceCount: interfaces.length,
    });

    return {
      lanIp,
      port: effectivePort,
      localUrl,
      joinUrl,
      interfaces,
      relayMode: "lan",
      isCloudRelay: false,
    };
  }
}
