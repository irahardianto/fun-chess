import { describe, it, expect } from "vitest";
import {
  HealthController,
  isTelemetryAuthorized,
  timingSafeStringEqual,
} from "../health.controller.js";
import type { IRoomCountProvider, IAddressingInfoProvider } from "../../http.interface.js";

describe("HealthController", () => {
  const mockRoomStore: IRoomCountProvider = {
    count: async () => 3,
  };

  const mockAddressService: IAddressingInfoProvider = {
    getAddressingInfo: (port: number) => ({
      lanIp: "192.168.1.10",
      port,
      localUrl: `http://localhost:${port}`,
      joinUrl: `http://192.168.1.10:${port}`,
      interfaces: ["192.168.1.10"],
      relayMode: "lan",
      isCloudRelay: false,
      publicUrl: "http://192.168.1.10:3000",
    }),
    isCloudRelay: () => false,
  };

  it("returns lightweight liveness response without operational metrics (ENH-003, CRIT-001)", () => {
    const controller = new HealthController({
      roomStore: mockRoomStore,
      addressService: mockAddressService,
      port: 3000,
      getActiveSocketCount: () => 5,
      isProduction: false,
    });

    const liveness = controller.getLiveness();
    expect(liveness.status).toBe("ok");
    expect(liveness.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(new Date(liveness.timestamp).getTime()).not.toBeNaN();

    // Verify operational metrics are not leaked
    const livenessRecord = liveness as unknown as Record<string, unknown>;
    expect(livenessRecord["activeRooms"]).toBeUndefined();
    expect(livenessRecord["activeSockets"]).toBeUndefined();
    expect(livenessRecord["memoryUsageMb"]).toBeUndefined();
  });

  it("returns detailed health metrics in development mode", async () => {
    const controller = new HealthController({
      roomStore: mockRoomStore,
      addressService: mockAddressService,
      port: 3000,
      getActiveSocketCount: () => 5,
      isProduction: false,
    });

    const detailed = await controller.getDetailedHealth();
    expect(detailed.status).toBe("ok");
    expect(detailed.activeRooms).toBe(3);
    expect(detailed.activeSockets).toBe(5);
    expect(detailed.memoryUsageMb.rss).toBeGreaterThan(0);
    expect(detailed.memoryUsageMb.heapTotal).toBeGreaterThan(0);
    expect(detailed.memoryUsageMb.heapUsed).toBeGreaterThan(0);
    expect(detailed.relay?.mode).toBe("lan");
    expect(detailed.relay?.publicUrl).toBe("http://192.168.1.10:3000");
  });

  it("redacts memory usage metrics to zero in production mode (MIN-001)", async () => {
    const controller = new HealthController({
      roomStore: mockRoomStore,
      addressService: mockAddressService,
      port: 3000,
      getActiveSocketCount: () => 5,
      isProduction: true,
    });

    const detailed = await controller.getDetailedHealth();
    expect(detailed.status).toBe("ok");
    expect(detailed.activeRooms).toBe(3);
    expect(detailed.activeSockets).toBe(5);
    expect(detailed.memoryUsageMb).toEqual({
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
    });
  });

  it("reflects cloud relay mode when configured", async () => {
    const cloudAddressService: IAddressingInfoProvider = {
      getAddressingInfo: (port: number) => ({
        lanIp: "10.0.0.1",
        port,
        localUrl: `http://localhost:${port}`,
        joinUrl: "https://fun-chess.a.run.app",
        interfaces: ["10.0.0.1"],
        relayMode: "cloud",
        isCloudRelay: true,
        publicUrl: "https://fun-chess.a.run.app",
      }),
      isCloudRelay: () => true,
    };

    const controller = new HealthController({
      roomStore: mockRoomStore,
      addressService: cloudAddressService,
      port: 8080,
      getActiveSocketCount: () => 1,
      isProduction: false,
    });

    const detailed = await controller.getDetailedHealth();
    expect(detailed.relay?.mode).toBe("cloud");
    expect(detailed.relay?.publicUrl).toBe("https://fun-chess.a.run.app");
  });

  it("delegates getHealth() directly to getDetailedHealth() (MIN-030)", async () => {
    const controller = new HealthController({
      roomStore: mockRoomStore,
      addressService: mockAddressService,
      port: 3000,
      getActiveSocketCount: () => 2,
      isProduction: false,
    });

    const health = await controller.getHealth();
    expect(health.status).toBe("ok");
    expect(health.activeRooms).toBe(3);
    expect(health.activeSockets).toBe(2);
    expect(health.memoryUsageMb.rss).toBeGreaterThan(0);
  });

  describe("Container Readiness & Versioned Health (MAJ-013, MIN-023)", () => {
    it("returns ready status when shutdownCoordinator is not terminating", () => {
      const controller = new HealthController({
        roomStore: mockRoomStore,
        addressService: mockAddressService,
        port: 3000,
        getActiveSocketCount: () => 5,
        shutdownCoordinator: { isTerminating: false, isShuttingDown: false },
      });

      const readiness = controller.getReadiness();
      expect(readiness.ready).toBe(true);
      expect(readiness.status).toBe("ready");
      expect(controller.getReady()).toEqual(readiness);
    });

    it("returns terminating status when shutdownCoordinator is terminating", () => {
      const controller = new HealthController({
        roomStore: mockRoomStore,
        addressService: mockAddressService,
        port: 3000,
        getActiveSocketCount: () => 5,
        shutdownCoordinator: { isTerminating: true },
      });

      const readiness = controller.getReadiness();
      expect(readiness.ready).toBe(false);
      expect(readiness.status).toBe("terminating");
      expect(controller.getReady()).toEqual(readiness);
    });

    it("returns terminating status when shutdownCoordinator.isShuttingDown === true (BLK-01)", () => {
      const coordinator = { isShuttingDown: true, isTerminating: false };
      const controller = new HealthController({
        roomStore: mockRoomStore,
        addressService: mockAddressService,
        port: 3000,
        getActiveSocketCount: () => 5,
        shutdownCoordinator: coordinator,
      });

      const ready = controller.getReady();
      expect(ready.ready).toBe(false);
      expect(ready.status).toBe("terminating");
    });

    it("dynamically updates readiness via setShutdownCoordinator (BLK-01)", () => {
      const controller = new HealthController({
        roomStore: mockRoomStore,
        addressService: mockAddressService,
        port: 3000,
        getActiveSocketCount: () => 5,
      });

      expect(controller.getReady()).toEqual({ status: "ready", ready: true });

      const coordinator = { isShuttingDown: true };
      controller.setShutdownCoordinator(coordinator);

      expect(controller.getReady()).toEqual({ status: "terminating", ready: false });
    });

    it("returns uniform versioned health payload envelope via getApiV1Health", () => {
      const controller = new HealthController({
        roomStore: mockRoomStore,
        addressService: mockAddressService,
        port: 3000,
        getActiveSocketCount: () => 5,
      });

      const v1Health = controller.getApiV1Health();
      expect(v1Health.data).toBeDefined();
      expect(v1Health.data.status).toBe("ok");
      expect(v1Health.data.version).toBe("1.0.0");
      expect(v1Health.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(v1Health.data.timestamp).toBeDefined();
    });

    it("formats Prometheus metrics including active sockets and rooms", async () => {
      const controller = new HealthController({
        roomStore: mockRoomStore,
        addressService: mockAddressService,
        port: 3000,
        getActiveSocketCount: () => 8,
      });

      const metrics = await controller.getPrometheusMetrics();
      expect(metrics).toContain("active_rooms 3");
      expect(metrics).toContain('active_connections{transport="websocket"} 8');
      expect(metrics).toContain("# HELP http_requests_total");
      expect(metrics).toContain("# TYPE http_requests_total counter");
    });
  });
});

describe("timingSafeStringEqual (MIN-001)", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeStringEqual("secret_token_123", "secret_token_123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeStringEqual("secret_token_123", "secret_token_456")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(timingSafeStringEqual("short", "longer_secret_token")).toBe(false);
  });

  it("returns false if either argument is not a string", () => {
    expect(timingSafeStringEqual(null as unknown as string, "secret")).toBe(false);
    expect(timingSafeStringEqual("secret", undefined as unknown as string)).toBe(false);
  });
});

describe("isTelemetryAuthorized (CRIT-001, MIN-001, MIN-033)", () => {
  const secret = ["metrics", "test", "secret", "12345"].join("-");

  describe("Loopback verification & Anti-spoofing", () => {
    it("authorizes direct loopback 127.0.0.1 in production when untrusted headers are absent", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "127.0.0.1",
          headers: {},
          isProduction: true,
        }),
      ).toBe(true);
    });

    it("authorizes direct loopback ::1 in production", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "::1",
          headers: {},
          isProduction: true,
        }),
      ).toBe(true);
    });

    it("authorizes direct loopback when directSocketIp is verified loopback", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "127.0.0.1",
          directSocketIp: "127.0.0.1",
          headers: {},
          isProduction: true,
        }),
      ).toBe(true);
    });

    it("denies access when clientIp claims loopback but physical directSocketIp is external (CRIT-001 spoofing)", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "127.0.0.1",
          directSocketIp: "203.0.113.195",
          headers: {},
          isProduction: true,
        }),
      ).toBe(false);
    });

    it("denies access when clientIp is 'unknown' (fail-closed CRIT-001)", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "unknown",
          headers: {},
          isProduction: true,
        }),
      ).toBe(false);
    });

    it("denies access when x-forwarded-for header is present even if clientIp is loopback (CRIT-001 untrusted header)", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "127.0.0.1",
          headers: {
            "x-forwarded-for": "127.0.0.1",
          },
          isProduction: true,
        }),
      ).toBe(false);
    });

    it("denies access when x-real-ip header is present even if clientIp is loopback", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "127.0.0.1",
          headers: {
            "x-real-ip": "127.0.0.1",
          },
          isProduction: true,
        }),
      ).toBe(false);
    });
  });

  describe("Secret token verification (MIN-001)", () => {
    it("authorizes matching x-metrics-secret header in production", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "203.0.113.195",
          directSocketIp: "203.0.113.195",
          headers: {
            "x-metrics-secret": secret,
          },
          metricsSecret: secret,
          isProduction: true,
        }),
      ).toBe(true);
    });

    it("authorizes matching x-metrics-secret when provided as an array", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "203.0.113.195",
          headers: {
            "x-metrics-secret": [secret],
          },
          metricsSecret: secret,
          isProduction: true,
        }),
      ).toBe(true);
    });

    it("authorizes matching Authorization Bearer token in production", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "203.0.113.195",
          headers: {
            authorization: `Bearer ${secret}`,
          },
          metricsSecret: secret,
          isProduction: true,
        }),
      ).toBe(true);
    });

    it("authorizes matching Authorization Bearer token when provided as an array", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "203.0.113.195",
          headers: {
            authorization: [`Bearer ${secret}`],
          },
          metricsSecret: secret,
          isProduction: true,
        }),
      ).toBe(true);
    });

    it("denies access when x-metrics-secret is incorrect", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "203.0.113.195",
          headers: {
            "x-metrics-secret": "wrong-secret",
          },
          metricsSecret: secret,
          isProduction: true,
        }),
      ).toBe(false);
    });

    it("denies access when Authorization Bearer token is incorrect", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "203.0.113.195",
          headers: {
            authorization: "Bearer wrong-token",
          },
          metricsSecret: secret,
          isProduction: true,
        }),
      ).toBe(false);
    });

    it("denies access when Authorization scheme is not Bearer", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "203.0.113.195",
          headers: {
            authorization: `Basic ${secret}`,
          },
          metricsSecret: secret,
          isProduction: true,
        }),
      ).toBe(false);
    });

    it("denies access when metricsSecret is configured but no header is sent", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "203.0.113.195",
          headers: {},
          metricsSecret: secret,
          isProduction: false,
        }),
      ).toBe(false);
    });
  });

  describe("Non-production environment defaults", () => {
    it("authorizes external clients in non-production when metricsSecret is unset", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "192.168.1.50",
          headers: {},
          metricsSecret: undefined,
          isProduction: false,
        }),
      ).toBe(true);
    });

    it("denies external clients in production when metricsSecret is unset", () => {
      expect(
        isTelemetryAuthorized({
          clientIp: "192.168.1.50",
          headers: {},
          metricsSecret: undefined,
          isProduction: true,
        }),
      ).toBe(false);
    });
  });
});
