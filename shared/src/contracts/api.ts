export interface LanInfoResponse {
  lanIp: string;
  port: number;
  localUrl: string;
  joinUrl: string;
  interfaces: string[];
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  activeRooms: number;
  activeSockets: number;
  memoryUsageMb: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
}
