import type { IApiClient, ApiRequestOptions, ApiResponse } from './api_client.interface';
import type {
  LanInfoResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
} from '@fun-chess/shared';

export class MockApiClient implements IApiClient {
  public lanInfoResult: LanInfoResponse = {
    lanIp: '192.168.1.50',
    port: 3000,
    localUrl: 'http://localhost:3000',
    joinUrl: 'http://192.168.1.50:3000',
    interfaces: ['192.168.1.50'],
    relayMode: 'lan',
    isCloudRelay: false,
  };
  public isHealthy: boolean = true;
  public isOnline: boolean = true;

  async get<T>(_url: string, _options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return { data: {} as T, status: 200, ok: true };
  }

  async post<T>(_url: string, _body?: unknown, _options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return { data: {} as T, status: 200, ok: true };
  }

  async getLanInfo(_options?: ApiRequestOptions): Promise<LanInfoResponse> {
    return this.lanInfoResult;
  }

  async checkHealth(_options?: ApiRequestOptions): Promise<LivenessHealthResponse> {
    return {
      status: this.isHealthy ? 'ok' : 'degraded',
      uptimeSeconds: 120,
      timestamp: new Date().toISOString(),
    };
  }

  async getDetailedHealth(_options?: ApiRequestOptions): Promise<DetailedHealthResponse> {
    return {
      status: this.isHealthy ? 'ok' : 'degraded',
      uptimeSeconds: 120,
      timestamp: new Date().toISOString(),
      activeRooms: 1,
      activeSockets: 2,
      memoryUsageMb: { rss: 40, heapTotal: 30, heapUsed: 20 },
    };
  }

  async checkConnectivity(_probeUrl?: string, _options?: ApiRequestOptions): Promise<boolean> {
    return this.isOnline;
  }
}
