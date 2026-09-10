import type {
  IRelayAddressService,
  LanInfoResponse,
} from "./relay_address.service.js";

/**
 * In-memory test double adapter for RelayAddressService.
 * Enables zero-I/O testing in other modules without mocking node:os or network interfaces.
 * Extracted to dedicated file per MIN-031.
 */
export class MockRelayAddressService implements IRelayAddressService {
  constructor(
    private readonly mockInfo: Partial<LanInfoResponse> = {},
    private readonly cloudRelay: boolean = false,
  ) {}

  public isCloudRelay(): boolean {
    return this.mockInfo.isCloudRelay ?? this.cloudRelay;
  }

  public getPublicUrl(): string | undefined {
    return this.mockInfo.publicUrl;
  }

  public getAddressingInfo(
    port: number = 3000,
    _correlationId?: string,
  ): LanInfoResponse {
    return {
      lanIp: this.mockInfo.lanIp ?? "127.0.0.1",
      port: this.mockInfo.port ?? port,
      localUrl: this.mockInfo.localUrl ?? `http://localhost:${port}`,
      joinUrl: this.mockInfo.joinUrl ?? `http://127.0.0.1:${port}`,
      interfaces: this.mockInfo.interfaces
        ? [...this.mockInfo.interfaces]
        : ["127.0.0.1"],
      relayMode: this.mockInfo.relayMode ?? (this.cloudRelay ? "cloud" : "lan"),
      isCloudRelay: this.mockInfo.isCloudRelay ?? this.cloudRelay,
      publicUrl: this.mockInfo.publicUrl,
    };
  }

  public generateJoinUrl(
    port: number = 3000,
    roomCode?: string,
    _correlationId?: string,
  ): string {
    const base = this.mockInfo.joinUrl ?? `http://127.0.0.1:${port}`;
    if (roomCode && roomCode.trim()) {
      return `${base}?room=${encodeURIComponent(roomCode.trim().toUpperCase())}`;
    }
    return base;
  }

  public getLocalLanIp(_correlationId?: string): string {
    return this.mockInfo.lanIp ?? "127.0.0.1";
  }

  public getAllLanInterfaces(_correlationId?: string): string[] {
    return this.mockInfo.interfaces
      ? [...this.mockInfo.interfaces]
      : ["127.0.0.1"];
  }
}
