import { describe, it, expect } from "vitest";
import { LanService } from "../lan.service.js";
import { NetworkInterfaceInfo } from "node:os";

describe("LanService", () => {
  const service = new LanService();

  describe("getAllLanInterfaces & getLocalLanIp", () => {
    it("filters out internal loopback and IPv6 interfaces", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        lo: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
          {
            address: "::1",
            netmask: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
            family: "IPv6",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "::1/128",
            scopeid: 0,
          },
        ],
        eth0: [
          {
            address: "192.168.1.150",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:11:22:33:44:55",
            internal: false,
            cidr: "192.168.1.150/24",
          },
          {
            address: "fe80::1",
            netmask: "ffff:ffff:ffff:ffff::",
            family: "IPv6",
            mac: "00:11:22:33:44:55",
            internal: false,
            cidr: "fe80::1/64",
            scopeid: 1,
          },
        ],
      };

      const ips = service.getAllLanInterfaces(mockInterfaces);
      expect(ips).toEqual(["192.168.1.150"]);

      const localIp = service.getLocalLanIp(mockInterfaces);
      expect(localIp).toBe("192.168.1.150");
    });

    it("prioritizes 192.168.* over 10.* and 172.* subnets", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        wlan0: [
          {
            address: "10.0.0.5",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:11:22:33:44:55",
            internal: false,
            cidr: "10.0.0.5/8",
          },
        ],
        eth0: [
          {
            address: "192.168.1.200",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:11:22:33:44:56",
            internal: false,
            cidr: "192.168.1.200/24",
          },
        ],
      };

      const localIp = service.getLocalLanIp(mockInterfaces);
      expect(localIp).toBe("192.168.1.200");
    });

    it("falls back to 10.* if 192.168.* is not available", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        wlan0: [
          {
            address: "10.0.0.5",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:11:22:33:44:55",
            internal: false,
            cidr: "10.0.0.5/8",
          },
        ],
      };

      const localIp = service.getLocalLanIp(mockInterfaces);
      expect(localIp).toBe("10.0.0.5");
    });

    it("falls back to 172.16-31.* if 192.168.* and 10.* are not available", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        docker0: [
          {
            address: "172.20.0.1",
            netmask: "255.255.0.0",
            family: "IPv4",
            mac: "00:11:22:33:44:55",
            internal: false,
            cidr: "172.20.0.1/16",
          },
        ],
      };

      const localIp = service.getLocalLanIp(mockInterfaces);
      expect(localIp).toBe("172.20.0.1");
    });

    it("falls back to 127.0.0.1 when no external interfaces exist", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        lo: [
          {
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: true,
            cidr: "127.0.0.1/8",
          },
        ],
      };

      const localIp = service.getLocalLanIp(mockInterfaces);
      expect(localIp).toBe("127.0.0.1");
    });

    it("honors LAN_IP environment variable when set", () => {
      const originalEnv = process.env.LAN_IP;
      process.env.LAN_IP = "192.168.1.77";
      try {
        const localIp = service.getLocalLanIp({});
        expect(localIp).toBe("192.168.1.77");
        const allIps = service.getAllLanInterfaces({});
        expect(allIps).toContain("192.168.1.77");
      } finally {
        if (originalEnv === undefined) {
          delete process.env.LAN_IP;
        } else {
          process.env.LAN_IP = originalEnv;
        }
      }
    });
  });

  describe("generateJoinUrl", () => {
    it("creates base URL with port and custom IP", () => {
      const url = service.generateJoinUrl(3000, undefined, "192.168.1.100");
      expect(url).toBe("http://192.168.1.100:3000");
    });

    it("appends uppercase room query parameter when provided", () => {
      const url = service.generateJoinUrl(3000, "star", "192.168.1.100");
      expect(url).toBe("http://192.168.1.100:3000?room=STAR");
    });
  });

  describe("QR Code Generation", () => {
    it("generates a valid SVG string", async () => {
      const svg = await service.generateQrCodeSvg(
        "http://192.168.1.100:3000?room=STAR",
      );
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("generates a valid base64 data URL", async () => {
      const dataUrl = await service.generateQrCodeDataUrl(
        "http://192.168.1.100:3000?room=STAR",
      );
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe("getLanInfo", () => {
    it("returns formatted LanInfoResponse object", () => {
      const info = service.getLanInfo(3000);
      expect(info.port).toBe(3000);
      expect(info.localUrl).toBe("http://localhost:3000");
      expect(info.joinUrl).toContain(":3000");
      expect(info.lanIp).toBeDefined();
      expect(Array.isArray(info.interfaces)).toBe(true);
    });
  });
});
