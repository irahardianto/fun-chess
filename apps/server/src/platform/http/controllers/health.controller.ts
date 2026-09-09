import {
  LivenessHealthResponse,
  DetailedHealthResponse,
} from "@fun-chess/shared";
import { IRoomCountProvider, IAddressingInfoProvider } from "../http.interface.js";

export interface HealthControllerOptions {
  roomStore: IRoomCountProvider;
  addressService: IAddressingInfoProvider;
  port: number;
  getActiveSocketCount: () => number;
  isProduction?: boolean;
  startTime?: number;
}

/**
 * Controller for container health checks and operational telemetry (MIN-029).
 * Redacts process memory metrics in production to prevent information disclosure (MIN-001).
 */
export class HealthController {
  private readonly roomStore: IRoomCountProvider;
  private readonly addressService: IAddressingInfoProvider;
  private readonly port: number;
  private readonly getActiveSocketCount: () => number;
  private readonly isProduction: boolean;
  private readonly startTime: number;

  constructor(options: HealthControllerOptions) {
    this.roomStore = options.roomStore;
    this.addressService = options.addressService;
    this.port = options.port;
    this.getActiveSocketCount = options.getActiveSocketCount;
    this.isProduction = options.isProduction ?? false;
    this.startTime = options.startTime ?? Date.now();
  }

  public getLiveness(): LivenessHealthResponse {
    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 100) / 10,
      timestamp: new Date().toISOString(),
    };
  }

  public async getDetailedHealth(): Promise<DetailedHealthResponse> {
    const mem = process.memoryUsage();
    const activeRooms = await this.roomStore.count();
    const activeSockets = this.getActiveSocketCount();
    const isCloud = this.addressService.isCloudRelay
      ? this.addressService.isCloudRelay()
      : false;
    const addrInfo = this.addressService.getAddressingInfo(this.port);

    // Redact process memory internals on unauthenticated endpoint in production (MIN-001)
    const memoryUsageMb = this.isProduction
      ? { rss: 0, heapTotal: 0, heapUsed: 0 }
      : {
          rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        };

    return {
      status: "ok",
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 100) / 10,
      timestamp: new Date().toISOString(),
      activeRooms,
      activeSockets,
      memoryUsageMb,
      relay: {
        mode: isCloud ? "cloud" : "lan",
        ...(addrInfo.publicUrl ? { publicUrl: addrInfo.publicUrl } : {}),
      },
    };
  }

  public async getHealth(): Promise<DetailedHealthResponse> {
    return this.getDetailedHealth();
  }
}
