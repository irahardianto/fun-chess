import { describe, it, expect } from "vitest";
import { HealthController } from "../health.controller.js";
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
    expect((liveness as any).activeRooms).toBeUndefined();
    expect((liveness as any).activeSockets).toBeUndefined();
    expect((liveness as any).memoryUsageMb).toBeUndefined();
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
});
