import os, { NetworkInterfaceInfo } from "node:os";
import QRCode from "qrcode";
import {
  IRelayAddressService,
  LanInfoResponse,
} from "./relay_address.service.js";

/**
 * Configuration options for LanService.
 */
export interface LanServiceConfig {
  readonly lanIp?: string;
  readonly hostIp?: string;
  readonly publicUrl?: string;
  readonly port?: number;
}

/**
 * Service for local network interface discovery, IP resolution, and QR code generation.
 * @deprecated Standardize on RelayAddressService implementing IRelayAddressService instead (MAJ-021).
 */
export class LanService implements IRelayAddressService {
  constructor(private readonly config: LanServiceConfig = {}) {}

  /**
   * Retrieves all non-internal IPv4 network interface addresses.
   */
  public getAllLanInterfaces(
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): string[] {
    const addresses: string[] = [];

    const envIp = this.config.lanIp ?? this.config.hostIp;
    if (envIp && !addresses.includes(envIp)) {
      addresses.push(envIp);
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
   * Discovers the best local LAN IPv4 address for hosting.
   * Prioritizes common local subnet ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
   */
  public getLocalLanIp(
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): string {
    const envIp = this.config.lanIp ?? this.config.hostIp;
    if (envIp) {
      return envIp;
    }

    const addresses = this.getAllLanInterfaces(customInterfaces);

    if (addresses.length === 0) {
      return "127.0.0.1";
    }

    // Sort prioritizing 192.168.*, then 10.*, then 172.16-31.*
    const preferred = addresses.find((ip) => ip.startsWith("192.168."));
    if (preferred) return preferred;

    const tenNet = addresses.find((ip) => ip.startsWith("10."));
    if (tenNet) return tenNet;

    const oneSevenTwo = addresses.find((ip) => {
      const match = /^172\.(\d+)\./.exec(ip);
      if (!match || !match[1]) return false;
      const secondOctet = parseInt(match[1], 10);
      return secondOctet >= 16 && secondOctet <= 31;
    });
    if (oneSevenTwo) return oneSevenTwo;

    const firstAddress = addresses[0];
    return firstAddress ?? "127.0.0.1";
  }

  /**
   * Generates a join URL for players on the LAN.
   */
  public generateJoinUrl(
    port?: number,
    roomCode?: string,
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]> | string,
  ): string {
    const effectivePort = port ?? this.config.port ?? 3000;
    const ip =
      typeof customInterfaces === "string"
        ? customInterfaces
        : this.getLocalLanIp(customInterfaces);
    const base = `http://${ip}:${effectivePort}`;
    if (roomCode) {
      return `${base}?room=${encodeURIComponent(roomCode.toUpperCase())}`;
    }
    return base;
  }

  /**
   * Generates an SVG string representation of a QR code.
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

  /**
   * Checks whether the current instance is configured as a public Cloud relay.
   */
  public isCloudRelay(): boolean {
    return Boolean(
      this.config.publicUrl && this.config.publicUrl.trim().length > 0,
    );
  }

  /**
   * Generates comprehensive LAN info response structure.
   */
  public getLanInfo(port?: number): LanInfoResponse {
    const effectivePort = port ?? this.config.port ?? 3000;
    const lanIp = this.getLocalLanIp();
    const interfaces = this.getAllLanInterfaces();
    const localUrl = `http://localhost:${effectivePort}`;
    const joinUrl = `http://${lanIp}:${effectivePort}`;

    return {
      lanIp,
      port: effectivePort,
      localUrl,
      joinUrl,
      interfaces: interfaces.length > 0 ? interfaces : [lanIp],
      relayMode: this.isCloudRelay() ? "cloud" : "lan",
      isCloudRelay: this.isCloudRelay(),
      publicUrl: this.config.publicUrl,
    };
  }

  /**
   * Compatibility alias matching IRelayAddressService.getAddressingInfo.
   */
  public getAddressingInfo(
    port?: number,
    customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
  ): LanInfoResponse {
    const effectivePort = port ?? this.config.port ?? 3000;
    const lanIp = this.getLocalLanIp(customInterfaces);
    const interfaces = this.getAllLanInterfaces(customInterfaces);
    const localUrl = `http://localhost:${effectivePort}`;
    const joinUrl = `http://${lanIp}:${effectivePort}`;

    return {
      lanIp,
      port: effectivePort,
      localUrl,
      joinUrl,
      interfaces: interfaces.length > 0 ? interfaces : [lanIp],
      relayMode: this.isCloudRelay() ? "cloud" : "lan",
      isCloudRelay: this.isCloudRelay(),
      publicUrl: this.config.publicUrl,
    };
  }
}

// Functional helper exports creating instances on-demand (MAJ-010: no global mutable singleton)
export function getLocalLanIp(): string {
  return new LanService().getLocalLanIp();
}

export function getAllLanInterfaces(): string[] {
  return new LanService().getAllLanInterfaces();
}

export function generateJoinUrl(port: number, roomCode?: string): string {
  return new LanService().generateJoinUrl(port, roomCode);
}
