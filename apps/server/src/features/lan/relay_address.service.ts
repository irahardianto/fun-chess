import os, { NetworkInterfaceInfo } from "node:os";
import QRCode from "qrcode";
import { LanInfoResponse as BaseLanInfoResponse } from "@fun-chess/shared";

/**
 * Extended LAN & Cloud Relay Information response structure.
 */
export interface LanInfoResponse extends BaseLanInfoResponse {
  /** Addressing mode: 'cloud' when running with PUBLIC_URL, 'lan' for local network */
  readonly relayMode: "cloud" | "lan";
  /** Flag indicating whether the server is acting as an internet cloud relay */
  readonly isCloudRelay: boolean;
  /** Public base URL when deployed to Cloud Run or behind a reverse proxy */
  readonly publicUrl?: string;
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
}

/**
 * Interface contract for RelayAddressService to enable I/O isolation and test mocking.
 */
export interface IRelayAddressService {
  /**
   * Resolves comprehensive LAN / Cloud addressing info.
   */
  getAddressingInfo(
    port?: number,
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): LanInfoResponse;

  /**
   * Generates a game room invitation URL for QR code generation or player sharing.
   */
  generateJoinUrl(
    port?: number,
    roomCode?: string,
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): string;

  /**
   * Checks whether the current instance is configured as a public Cloud relay.
   */
  isCloudRelay(): boolean;

  /**
   * Returns the primary LAN IP or public hostname.
   */
  getLocalLanIp(customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>): string;

  /**
   * Retrieves all detected physical/configured IPv4 interfaces.
   */
  getAllLanInterfaces(
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): string[];
}

/**
 * Normalizes a public URL string by stripping trailing slashes and omitting standard ports.
 *
 * @param rawUrl - Raw URL string (e.g. "https://fun-chess.a.run.app/" or "http://example.com:80")
 * @returns Normalized URL string
 */
export function normalizePublicUrl(rawUrl: string): string {
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
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/**
 * Extracts the hostname or domain from a public URL string.
 *
 * @param publicUrl - Public URL string
 * @returns Hostname string or fallback to raw string
 */
export function extractHostnameFromUrl(publicUrl: string): string {
  const trimmed = publicUrl.trim();
  if (!trimmed) {
    return "127.0.0.1";
  }

  try {
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    const urlObj = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
    return urlObj.hostname || trimmed;
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").split(/[:/]/)[0] || "127.0.0.1";
  }
}

/**
 * Service for intelligent cloud/container-aware host discovery, LAN interface resolution,
 * and game room join URL generation.
 */
export class RelayAddressService implements IRelayAddressService {
  constructor(private readonly config: RelayAddressConfig = {}) {}

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
  public getPublicUrl(): string | undefined {
    const publicUrl = this.config.publicUrl;
    if (!publicUrl || !publicUrl.trim()) {
      return undefined;
    }
    return normalizePublicUrl(publicUrl);
  }

  /**
   * Retrieves all non-internal IPv4 network interface addresses.
   * Includes manual LAN IP overrides if configured.
   *
   * @param customInterfaces - Optional network interfaces dictionary for pure testability
   */
  public getAllLanInterfaces(
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): string[] {
    const addresses: string[] = [];

    const manualIp = this.config.lanIp ?? this.config.hostIp;
    if (manualIp && manualIp.trim()) {
      const trimmedIp = manualIp.trim();
      if (!addresses.includes(trimmedIp)) {
        addresses.push(trimmedIp);
      }
    }

    const interfaces = customInterfaces ?? os.networkInterfaces();

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

    return addresses;
  }

  /**
   * Discovers the best local LAN IPv4 address or public hostname.
   * Priority Order:
   * 1. Public Cloud Relay hostname (if isCloudRelay is true)
   * 2. Manual LAN IP override (config.lanIp or process.env.LAN_IP / HOST_IP)
   * 3. Discovered local IPv4 interface (192.168.x.x -> 10.x.x.x -> 172.16-31.x.x -> first address)
   * 4. Fallback to 127.0.0.1
   *
   * @param customInterfaces - Optional network interfaces dictionary for pure testability
   */
  public getLocalLanIp(
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): string {
    // 1. Cloud Relay Priority
    if (this.isCloudRelay()) {
      const publicUrl = this.getPublicUrl();
      if (publicUrl) {
        return extractHostnameFromUrl(publicUrl);
      }
    }

    // 2. Manual IP Override
    const manualIp = this.config.lanIp ?? this.config.hostIp;
    if (manualIp && manualIp.trim()) {
      return manualIp.trim();
    }

    // 3. Discovered local IPv4 interface
    const addresses = this.getAllLanInterfaces(customInterfaces);

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
   * @param customInterfaces - Optional network interfaces dictionary for pure testability
   */
  public generateJoinUrl(
    port?: number,
    roomCode?: string,
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): string {
    const effectivePort = port ?? this.config.port ?? 3000;

    let base: string;

    if (this.isCloudRelay()) {
      base = this.getPublicUrl()!;
    } else {
      const lanIp = this.getLocalLanIp(customInterfaces);
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
   * @param customInterfaces - Optional network interfaces dictionary for pure testability
   */
  public getAddressingInfo(
    port?: number,
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): LanInfoResponse {
    const effectivePort = port ?? this.config.port ?? 3000;
    const lanIp = this.getLocalLanIp(customInterfaces);
    const rawInterfaces = this.getAllLanInterfaces(customInterfaces);
    const interfaces = rawInterfaces.length > 0 ? rawInterfaces : [lanIp];
    const localUrl = `http://localhost:${effectivePort}`;

    if (this.isCloudRelay()) {
      const publicUrl = this.getPublicUrl()!;
      const joinUrl = publicUrl;

      // In production cloud relay (no custom test interfaces injected), suppress internal network topology (MIN-004)
      const cloudInterfaces =
        customInterfaces !== undefined ? interfaces : [];

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
      customInterfaces,
    );

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

  /**
   * Generates an SVG string representation of a QR code.
   *
   * @param text - Text content to encode into QR code
   */
  public async generateQrCodeSvg(text: string): Promise<string> {
    return QRCode.toString(text, {
      type: "svg",
      margin: 2,
      color: {
        dark: "#1a1a2e",
        light: "#ffffff",
      },
    });
  }

  /**
   * Generates a base64 Data URL representation of a QR code.
   *
   * @param text - Text content to encode into QR code
   */
  public async generateQrCodeDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text, {
      margin: 2,
      color: {
        dark: "#1a1a2e",
        light: "#ffffff",
      },
    });
  }
}

/**
 * In-memory test double adapter for RelayAddressService.
 * Enables zero-I/O testing in other modules without mocking node:os or process.env.
 */
export class MockRelayAddressService implements IRelayAddressService {
  constructor(
    private readonly mockInfo: Partial<LanInfoResponse> = {},
    private readonly cloudRelay: boolean = false,
  ) {}

  public isCloudRelay(): boolean {
    return this.mockInfo.isCloudRelay ?? this.cloudRelay;
  }

  public getAddressingInfo(port: number = 3000): LanInfoResponse {
    return {
      lanIp: this.mockInfo.lanIp ?? "127.0.0.1",
      port: this.mockInfo.port ?? port,
      localUrl: this.mockInfo.localUrl ?? `http://localhost:${port}`,
      joinUrl: this.mockInfo.joinUrl ?? `http://127.0.0.1:${port}`,
      interfaces: this.mockInfo.interfaces ?? ["127.0.0.1"],
      relayMode: this.mockInfo.relayMode ?? (this.cloudRelay ? "cloud" : "lan"),
      isCloudRelay: this.mockInfo.isCloudRelay ?? this.cloudRelay,
      publicUrl: this.mockInfo.publicUrl,
    };
  }

  public generateJoinUrl(port: number = 3000, roomCode?: string): string {
    const base = this.mockInfo.joinUrl ?? `http://127.0.0.1:${port}`;
    if (roomCode && roomCode.trim()) {
      return `${base}?room=${encodeURIComponent(roomCode.trim().toUpperCase())}`;
    }
    return base;
  }

  public getLocalLanIp(): string {
    return this.mockInfo.lanIp ?? "127.0.0.1";
  }

  public getAllLanInterfaces(): string[] {
    return this.mockInfo.interfaces
      ? [...this.mockInfo.interfaces]
      : ["127.0.0.1"];
  }
}

// Functional helpers creating instances on demand (MAJ-010: no global mutable singleton)

/**
 * Helper for resolving addressing info.
 */
export function getRelayAddressingInfo(
  port?: number,
  customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
): LanInfoResponse {
  return new RelayAddressService().getAddressingInfo(port, customInterfaces);
}

/**
 * Helper for generating room join URLs.
 */
export function generateRelayJoinUrl(
  port: number,
  roomCode?: string,
  customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string {
  return new RelayAddressService().generateJoinUrl(
    port,
    roomCode,
    customInterfaces,
  );
}

/**
 * Helper for checking Cloud Relay mode.
 */
export function isCloudRelay(): boolean {
  return new RelayAddressService().isCloudRelay();
}

/**
 * Helper for retrieving primary local LAN IP.
 */
export function getRelayLocalLanIp(
  customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string {
  return new RelayAddressService().getLocalLanIp(customInterfaces);
}

/**
 * Helper for retrieving all local LAN interfaces.
 */
export function getAllRelayLanInterfaces(
  customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string[] {
  return new RelayAddressService().getAllLanInterfaces(customInterfaces);
}

/**
 * Functional alias matching getAddressingInfo.
 */
export function getAddressingInfo(
  port?: number,
  customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
): LanInfoResponse {
  return new RelayAddressService().getAddressingInfo(port, customInterfaces);
}
