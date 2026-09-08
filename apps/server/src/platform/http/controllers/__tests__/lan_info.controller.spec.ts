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
    expect(result.port).toBe(4000);
    expect(result.lanIp).toBe("192.168.1.100");
    expect(result.localUrl).toBe("http://localhost:4000");
    expect(result.joinUrl).toBe("http://192.168.1.100:4000");
    expect(result.relayMode).toBe("lan");
    expect(result.isCloudRelay).toBe(false);
  });
});
