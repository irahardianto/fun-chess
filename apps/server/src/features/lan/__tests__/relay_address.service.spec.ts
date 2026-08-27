import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NetworkInterfaceInfo } from "node:os";
import {
  RelayAddressService,
  normalizePublicUrl,
  extractHostnameFromUrl,
  MockRelayAddressService,
  getRelayAddressingInfo,
  generateRelayJoinUrl,
  isCloudRelay,
  getRelayLocalLanIp,
  getAllRelayLanInterfaces,
} from "../relay_address.service.js";

describe("RelayAddressService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.PUBLIC_URL;
    delete process.env.LAN_IP;
    delete process.env.HOST_IP;
    delete process.env.PORT;
    delete process.env.HOST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("normalizePublicUrl & extractHostnameFromUrl", () => {
    it("strips trailing slashes from URLs", () => {
      expect(normalizePublicUrl("https://fun-chess-xyz.a.run.app/")).toBe(
        "https://fun-chess-xyz.a.run.app",
      );
      expect(normalizePublicUrl("https://fun-chess-xyz.a.run.app///")).toBe(
        "https://fun-chess-xyz.a.run.app",
      );
    });

    it("omits default ports (80 for http, 443 for https)", () => {
      expect(normalizePublicUrl("http://example.com:80")).toBe(
        "http://example.com",
      );
      expect(normalizePublicUrl("http://example.com:80/")).toBe(
        "http://example.com",
      );
      expect(normalizePublicUrl("https://example.com:443")).toBe(
        "https://example.com",
      );
      expect(normalizePublicUrl("https://example.com:443/")).toBe(
        "https://example.com",
      );
    });

    it("preserves non-default ports", () => {
      expect(normalizePublicUrl("http://example.com:3000")).toBe(
        "http://example.com:3000",
      );
      expect(normalizePublicUrl("https://example.com:8443/app/")).toBe(
        "https://example.com:8443/app",
      );
    });

    it("adds https:// protocol if missing from domain", () => {
      expect(normalizePublicUrl("fun-chess-xyz.a.run.app")).toBe(
        "https://fun-chess-xyz.a.run.app",
      );
    });

    it("handles empty or whitespace string safely", () => {
      expect(normalizePublicUrl("")).toBe("");
      expect(normalizePublicUrl("   ")).toBe("");
    });

    it("extracts hostname from URLs correctly", () => {
      expect(extractHostnameFromUrl("https://fun-chess-xyz.a.run.app")).toBe(
        "fun-chess-xyz.a.run.app",
      );
      expect(extractHostnameFromUrl("http://192.168.1.100:3000/path")).toBe(
        "192.168.1.100",
      );
      expect(extractHostnameFromUrl("fun-chess.cloud")).toBe("fun-chess.cloud");
      expect(extractHostnameFromUrl("")).toBe("127.0.0.1");
    });
  });

  describe("Cloud Relay Mode (Priority 1)", () => {
    it("identifies cloud relay mode via constructor config.publicUrl", () => {
      const service = new RelayAddressService({
        publicUrl: "https://fun-chess-xyz.a.run.app",
      });

      expect(service.isCloudRelay()).toBe(true);
      expect(service.getPublicUrl()).toBe("https://fun-chess-xyz.a.run.app");
      expect(service.getLocalLanIp()).toBe("fun-chess-xyz.a.run.app");
    });

    it("identifies cloud relay mode via process.env.PUBLIC_URL", () => {
      process.env.PUBLIC_URL = "https://fun-chess-prod.a.run.app/";
      const service = new RelayAddressService();

      expect(service.isCloudRelay()).toBe(true);
      expect(service.getPublicUrl()).toBe("https://fun-chess-prod.a.run.app");
      expect(service.getLocalLanIp()).toBe("fun-chess-prod.a.run.app");
    });

    it("generates cloud join URLs without trailing slash and with uppercase room code", () => {
      const service = new RelayAddressService({
        publicUrl: "https://fun-chess-xyz.a.run.app/",
      });

      expect(service.generateJoinUrl(3000)).toBe(
        "https://fun-chess-xyz.a.run.app",
      );
      expect(service.generateJoinUrl(3000, "star")).toBe(
        "https://fun-chess-xyz.a.run.app?room=STAR",
      );
      expect(service.generateJoinUrl(3000, "room 42")).toBe(
        "https://fun-chess-xyz.a.run.app?room=ROOM%2042",
      );
    });

    it("returns complete LanInfoResponse with relayMode: cloud and isCloudRelay: true", () => {
      const service = new RelayAddressService({
        publicUrl: "https://fun-chess-xyz.a.run.app",
        port: 8080,
      });

      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        eth0: [
          {
            address: "10.0.0.2",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "10.0.0.2/24",
          },
        ],
      };

      const info = service.getAddressingInfo(8080, mockInterfaces);

      expect(info).toEqual({
        lanIp: "fun-chess-xyz.a.run.app",
        port: 8080,
        localUrl: "http://localhost:8080",
        joinUrl: "https://fun-chess-xyz.a.run.app",
        interfaces: ["10.0.0.2"],
        relayMode: "cloud",
        isCloudRelay: true,
        publicUrl: "https://fun-chess-xyz.a.run.app",
      });
    });

    it("falls back to [lanIp] when no physical interfaces are available in cloud mode", () => {
      const service = new RelayAddressService({
        publicUrl: "https://fun-chess-xyz.a.run.app",
      });

      const info = service.getAddressingInfo(3000, {});
      expect(info.interfaces).toEqual(["fun-chess-xyz.a.run.app"]);
    });
  });

  describe("Manual LAN IP Override (Priority 2)", () => {
    it("honors config.lanIp over interface discovery", () => {
      const service = new RelayAddressService({
        lanIp: "192.168.1.77",
      });

      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        eth0: [
          {
            address: "10.0.0.5",
            netmask: "255.0.0.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "10.0.0.5/8",
          },
        ],
      };

      expect(service.isCloudRelay()).toBe(false);
      expect(service.getLocalLanIp(mockInterfaces)).toBe("192.168.1.77");
      expect(service.getAllLanInterfaces(mockInterfaces)).toContain(
        "192.168.1.77",
      );
      expect(service.getAllLanInterfaces(mockInterfaces)).toContain("10.0.0.5");
    });

    it("honors process.env.LAN_IP and process.env.HOST_IP", () => {
      process.env.HOST_IP = "172.28.0.50";
      const service = new RelayAddressService();

      expect(service.getLocalLanIp({})).toBe("172.28.0.50");
      expect(service.getAllLanInterfaces({})).toEqual(["172.28.0.50"]);
    });

    it("generates LAN join URLs with port and room code", () => {
      const service = new RelayAddressService({
        lanIp: "192.168.1.50",
      });

      expect(service.generateJoinUrl(3000)).toBe("http://192.168.1.50:3000");
      expect(service.generateJoinUrl(3000, "chess")).toBe(
        "http://192.168.1.50:3000?room=CHESS",
      );
    });

    it("omits port :80 in LAN mode when listening on port 80", () => {
      const service = new RelayAddressService({
        lanIp: "192.168.1.50",
      });

      expect(service.generateJoinUrl(80)).toBe("http://192.168.1.50");
      expect(service.generateJoinUrl(80, "star")).toBe(
        "http://192.168.1.50?room=STAR",
      );
    });
  });

  describe("Local Interface Discovery & Subnet Prioritization (Priority 3 & 4)", () => {
    const service = new RelayAddressService();

    it("filters out internal loopback and IPv6 addresses", () => {
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

    it("prioritizes 192.168.* over 10.* and 172.16-31.*", () => {
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
        docker0: [
          {
            address: "172.20.0.1",
            netmask: "255.255.0.0",
            family: "IPv4",
            mac: "00:11:22:33:44:57",
            internal: false,
            cidr: "172.20.0.1/16",
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

      const info = service.getAddressingInfo(3000, mockInterfaces);
      expect(info.relayMode).toBe("lan");
      expect(info.isCloudRelay).toBe(false);
      expect(info.lanIp).toBe("127.0.0.1");
      expect(info.joinUrl).toBe("http://127.0.0.1:3000");
    });
  });

  describe("QR Code Generation", () => {
    const service = new RelayAddressService();

    it("generates a valid SVG string", async () => {
      const svg = await service.generateQrCodeSvg(
        "https://fun-chess-xyz.a.run.app?room=STAR",
      );
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("generates a valid base64 data URL", async () => {
      const dataUrl = await service.generateQrCodeDataUrl(
        "https://fun-chess-xyz.a.run.app?room=STAR",
      );
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe("MockRelayAddressService Test Double", () => {
    it("allows mocking addressing info and cloud mode for pure unit testing", () => {
      const mockService = new MockRelayAddressService(
        {
          lanIp: "192.168.1.99",
          joinUrl: "http://192.168.1.99:5000",
          relayMode: "lan",
          isCloudRelay: false,
        },
        false,
      );

      expect(mockService.isCloudRelay()).toBe(false);
      expect(mockService.getLocalLanIp()).toBe("192.168.1.99");
      expect(mockService.generateJoinUrl(5000, "test")).toBe(
        "http://192.168.1.99:5000?room=TEST",
      );

      const info = mockService.getAddressingInfo(5000);
      expect(info.lanIp).toBe("192.168.1.99");
      expect(info.relayMode).toBe("lan");
    });

    it("supports cloud relay mode mock", () => {
      const mockService = new MockRelayAddressService(
        {
          lanIp: "cloud-relay.example.com",
          joinUrl: "https://cloud-relay.example.com",
          publicUrl: "https://cloud-relay.example.com",
          relayMode: "cloud",
          isCloudRelay: true,
        },
        true,
      );

      expect(mockService.isCloudRelay()).toBe(true);
      expect(mockService.generateJoinUrl(443, "room1")).toBe(
        "https://cloud-relay.example.com?room=ROOM1",
      );
    });
  });

  describe("Singleton Helper Functions", () => {
    it("exports functional helpers matching default service behavior", () => {
      expect(typeof isCloudRelay()).toBe("boolean");
      expect(typeof getRelayLocalLanIp()).toBe("string");
      expect(Array.isArray(getAllRelayLanInterfaces())).toBe(true);

      const info = getRelayAddressingInfo(3000);
      expect(info.port).toBe(3000);
      expect(typeof info.joinUrl).toBe("string");

      const joinUrl = generateRelayJoinUrl(3000, "abc");
      expect(joinUrl).toContain("?room=ABC");
    });
  });
});
