import { describe, it, expect } from "vitest";
import { LanInfoController } from "../lan_info.controller.js";
import type { IAddressingInfoProvider } from "../../http.interface.js";

describe("LanInfoController", () => {
  it("delegates to addressService.getAddressingInfo(port) (MAJ-035)", () => {
    const mockAddressService: IAddressingInfoProvider = {
      getAddressingInfo: (port: number) => ({
        lanIp: "192.168.1.100",
        port,
        localUrl: `http://localhost:${port}`,
        joinUrl: `http://192.168.1.100:${port}`,
        interfaces: ["192.168.1.100"],
        relayMode: "lan",
        isCloudRelay: false,
      }),
    };

    const controller = new LanInfoController({
      addressService: mockAddressService,
    });

    const result = controller.getLanInfo(4000);
    expect(result.data).toBeDefined();
    expect(result.data.port).toBe(4000);
    expect(result.data.lanIp).toBe("192.168.1.100");
    expect(result.data.localUrl).toBe("http://localhost:4000");
    expect(result.data.joinUrl).toBe("http://192.168.1.100:4000");
    expect(result.data.relayMode).toBe("lan");
    expect(result.data.isCloudRelay).toBe(false);
  });

  it("handles cloud relay mode addressing info correctly (MIN-027)", () => {
    const mockCloudAddressService: IAddressingInfoProvider = {
      getAddressingInfo: (port: number) => ({
        lanIp: "cloud-relay.fun-chess.io",
        port,
        localUrl: `http://localhost:${port}`,
        joinUrl: "https://cloud-relay.fun-chess.io",
        publicUrl: "https://cloud-relay.fun-chess.io",
        interfaces: ["cloud-relay.fun-chess.io"],
        relayMode: "cloud",
        isCloudRelay: true,
      }),
      isCloudRelay: () => true,
    };

    const controller = new LanInfoController({
      addressService: mockCloudAddressService,
    });

    const result = controller.getLanInfo(8080);
    expect(result.data).toBeDefined();
    expect(result.data.port).toBe(8080);
    expect(result.data.lanIp).toBe("cloud-relay.fun-chess.io");
    expect(result.data.joinUrl).toBe("https://cloud-relay.fun-chess.io");
    expect(result.data.publicUrl).toBe("https://cloud-relay.fun-chess.io");
    expect(result.data.relayMode).toBe("cloud");
    expect(result.data.isCloudRelay).toBe(true);
  });

  it("falls back to default port 3000 when port is omitted or 0 (MIN-027)", () => {
    const recordedPorts: number[] = [];
    const mockAddressService: IAddressingInfoProvider = {
      getAddressingInfo: (port: number) => {
        recordedPorts.push(port);
        return {
          lanIp: "127.0.0.1",
          port,
          localUrl: `http://localhost:${port}`,
          joinUrl: `http://127.0.0.1:${port}`,
          interfaces: ["127.0.0.1"],
          relayMode: "lan",
          isCloudRelay: false,
        };
      },
    };

    const controller = new LanInfoController({
      addressService: mockAddressService,
    });

    const resultDefault = controller.getLanInfo();
    expect(resultDefault.data.port).toBe(3000);
    expect(recordedPorts).toContain(3000);

    const resultZero = controller.getLanInfo(0);
    expect(resultZero.data.port).toBe(3000);
    expect(recordedPorts).toEqual([3000, 3000]);
  });
});
