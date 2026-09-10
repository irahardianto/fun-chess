import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os, { NetworkInterfaceInfo } from "node:os";
import {
  RelayAddressService,
  SystemNetworkInterfaceProvider,
  StaticNetworkInterfaceProvider,
  normalizePublicUrl,
  extractHostnameFromUrl,
} from "../relay_address.service.js";
import { MockRelayAddressService } from "../mock_relay_address.service.js";

describe("RelayAddressService & NetworkInterfaceProvider (MAJ-016, MIN-031, ENH-008)", () => {
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

  describe("NetworkInterfaceProvider implementations", () => {
    it("SystemNetworkInterfaceProvider delegates directly to os.networkInterfaces()", () => {
      const provider = new SystemNetworkInterfaceProvider();
      const osInterfaces = os.networkInterfaces();
      const providerInterfaces = provider.getNetworkInterfaces();
      expect(providerInterfaces).toEqual(osInterfaces);
    });

    it("StaticNetworkInterfaceProvider returns configured static interfaces", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        eth0: [
          {
            address: "192.168.1.55",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:00:00:00:00:00",
            internal: false,
            cidr: "192.168.1.55/24",
          },
        ],
      };
      const provider = new StaticNetworkInterfaceProvider(mockInterfaces);
      expect(provider.getNetworkInterfaces()).toBe(mockInterfaces);
    });

    it("StaticNetworkInterfaceProvider defaults to empty dictionary when omitted", () => {
      const provider = new StaticNetworkInterfaceProvider();
      expect(provider.getNetworkInterfaces()).toEqual({});
    });
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
      expect(extractHostnameFromUrl("   ")).toBe("127.0.0.1");
    });

    it("logs debug diagnostic when normalizePublicUrl encounters a malformed URL (ENH-005, ENH-008)", () => {
      const mockLogger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const result = normalizePublicUrl(
        "http://[invalid-ipv6",
        mockLogger,
        "corr-url-1",
      );
      expect(result).toBe("http://[invalid-ipv6");
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Failed to normalize public URL, falling back to trimmed string",
        expect.objectContaining({
          operation: "normalize_public_url",
          correlationId: "corr-url-1",
          rawUrl: "http://[invalid-ipv6",
        }),
      );
    });

    it("logs debug diagnostic when extractHostnameFromUrl encounters a malformed URL (ENH-005, ENH-008)", () => {
      const mockLogger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const result = extractHostnameFromUrl(
        "http://[invalid-ipv6",
        mockLogger,
        "corr-host-1",
      );
      expect(result).toBe("[invalid-ipv6");
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Failed to parse hostname from URL, using regex fallback",
        expect.objectContaining({
          operation: "extract_hostname_from_url",
          correlationId: "corr-host-1",
          rawUrl: "http://[invalid-ipv6",
        }),
      );
    });

    it("passes logger and correlationId to normalizePublicUrl and extractHostnameFromUrl in RelayAddressService", () => {
      const mockLogger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const service = new RelayAddressService({
        publicUrl: "http://[invalid-ipv6",
        logger: mockLogger,
      });

      expect(service.getPublicUrl("corr-pub-url")).toBe("http://[invalid-ipv6");
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Failed to normalize public URL, falling back to trimmed string",
        expect.objectContaining({
          operation: "normalize_public_url",
          correlationId: "corr-pub-url",
        }),
      );

      service.getLocalLanIp("corr-lan-ip");
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Failed to parse hostname from URL, using regex fallback",
        expect.objectContaining({
          operation: "extract_hostname_from_url",
          correlationId: "corr-lan-ip",
        }),
      );
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

    it("returns undefined for getPublicUrl when publicUrl is not set or empty", () => {
      const service1 = new RelayAddressService({});
      expect(service1.getPublicUrl()).toBeUndefined();
      expect(service1.isCloudRelay()).toBe(false);

      const service2 = new RelayAddressService({ publicUrl: "   " });
      expect(service2.getPublicUrl()).toBeUndefined();
      expect(service2.isCloudRelay()).toBe(false);
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

    it("returns complete LanInfoResponse with relayMode: cloud and isCloudRelay: true when using StaticNetworkInterfaceProvider", () => {
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

      const service = new RelayAddressService({
        publicUrl: "https://fun-chess-xyz.a.run.app",
        port: 8080,
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      const info = service.getAddressingInfo(8080);

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

    it("falls back to [lanIp] when no physical interfaces are available in cloud mode with StaticNetworkInterfaceProvider", () => {
      const service = new RelayAddressService({
        publicUrl: "https://fun-chess-xyz.a.run.app",
        networkInterfaceProvider: new StaticNetworkInterfaceProvider({}),
      });

      const info = service.getAddressingInfo(3000);
      expect(info.interfaces).toEqual(["fun-chess-xyz.a.run.app"]);
    });

    it("suppresses internal network interfaces array in cloud relay mode with SystemNetworkInterfaceProvider to prevent topology disclosure (MIN-004)", () => {
      const service = new RelayAddressService({
        publicUrl: "https://fun-chess-xyz.a.run.app",
        port: 8080,
      });

      const info = service.getAddressingInfo(8080);
      expect(service.isCloudRelay()).toBe(true);
      expect(info.interfaces).toEqual([]);
    });
  });

  describe("Manual LAN IP Override (Priority 2)", () => {
    it("honors config.lanIp over interface discovery", () => {
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

      const service = new RelayAddressService({
        lanIp: "192.168.1.77",
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      expect(service.isCloudRelay()).toBe(false);
      expect(service.getLocalLanIp()).toBe("192.168.1.77");
      expect(service.getAllLanInterfaces()).toContain("192.168.1.77");
      expect(service.getAllLanInterfaces()).toContain("10.0.0.5");
    });

    it("honors config.lanIp and config.hostIp", () => {
      const service = new RelayAddressService({
        hostIp: "172.28.0.50",
        networkInterfaceProvider: new StaticNetworkInterfaceProvider({}),
      });

      expect(service.getLocalLanIp()).toBe("172.28.0.50");
      expect(service.getAllLanInterfaces()).toEqual(["172.28.0.50"]);
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

      const service = new RelayAddressService({
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      const ips = service.getAllLanInterfaces();
      expect(ips).toEqual(["192.168.1.150"]);

      const localIp = service.getLocalLanIp();
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

      const service = new RelayAddressService({
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      const localIp = service.getLocalLanIp();
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

      const service = new RelayAddressService({
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      const localIp = service.getLocalLanIp();
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

      const service = new RelayAddressService({
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      const localIp = service.getLocalLanIp();
      expect(localIp).toBe("172.20.0.1");
    });

    it("skips 172.x.x.x if second octet is < 16 or > 31 and uses firstAddress fallback", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        custom0: [
          {
            address: "172.15.0.1",
            netmask: "255.255.0.0",
            family: "IPv4",
            mac: "00:11:22:33:44:55",
            internal: false,
            cidr: "172.15.0.1/16",
          },
        ],
      };

      const service = new RelayAddressService({
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      expect(service.getLocalLanIp()).toBe("172.15.0.1");
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

      const service = new RelayAddressService({
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      const localIp = service.getLocalLanIp();
      expect(localIp).toBe("127.0.0.1");

      const info = service.getAddressingInfo(3000);
      expect(info.relayMode).toBe("lan");
      expect(info.isCloudRelay).toBe(false);
      expect(info.lanIp).toBe("127.0.0.1");
      expect(info.joinUrl).toBe("http://127.0.0.1:3000");
    });

    it("falls back to ['127.0.0.1'] when networkInterfaceProvider throws an error (MAJ-013, MAJ-016)", () => {
      const throwingProvider = {
        getNetworkInterfaces: () => {
          throw new Error("UV_ENOBUFS: no buffer space available");
        },
      };

      const mockLogger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const service = new RelayAddressService({
        networkInterfaceProvider: throwingProvider,
        logger: mockLogger,
      });

      const addresses = service.getAllLanInterfaces("corr-throw-test");
      expect(addresses).toEqual(["127.0.0.1"]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to retrieve network interfaces from provider, falling back to localhost",
        expect.objectContaining({
          operation: "get_all_lan_interfaces",
          correlationId: "corr-throw-test",
          error: "UV_ENOBUFS: no buffer space available",
        }),
      );

      const localIp = service.getLocalLanIp();
      expect(localIp).toBe("127.0.0.1");
    });
  });

  describe("Observability & Structured Diagnostics (ENH-008)", () => {
    it("propagates correlationId in getAddressingInfo, generateJoinUrl, and getAllLanInterfaces logs", () => {
      const mockLogger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const service = new RelayAddressService({
        port: 4000,
        logger: mockLogger,
        networkInterfaceProvider: new StaticNetworkInterfaceProvider({}),
      });

      const correlationId = "corr-lan-trace-999";
      const info = service.getAddressingInfo(4000, correlationId);
      expect(info.port).toBe(4000);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Resolved LAN addressing info",
        expect.objectContaining({
          operation: "get_addressing_info",
          correlationId,
          relayMode: "lan",
        }),
      );

      const joinUrl = service.generateJoinUrl(4000, "TEST", correlationId);
      expect(joinUrl).toContain("room=TEST");

      const ifaces = service.getAllLanInterfaces(correlationId);
      expect(ifaces).toBeDefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Retrieved LAN network interfaces",
        expect.objectContaining({
          operation: "get_all_lan_interfaces",
          correlationId,
        }),
      );
    });

    it("propagates correlationId in cloud relay mode getAddressingInfo", () => {
      const mockLogger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const service = new RelayAddressService({
        publicUrl: "https://chess.example.com",
        port: 8080,
        logger: mockLogger,
      });

      const correlationId = "corr-cloud-trace-123";
      const info = service.getAddressingInfo(8080, correlationId);
      expect(info.isCloudRelay).toBe(true);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Resolved Cloud Relay addressing info",
        expect.objectContaining({
          operation: "get_addressing_info",
          correlationId,
          relayMode: "cloud",
          publicUrl: "https://chess.example.com",
        }),
      );
    });
  });

  describe("MockRelayAddressService Test Double (MIN-031)", () => {
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

    it("supports cloud relay mode mock and default values", () => {
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
      expect(mockService.getPublicUrl()).toBe(
        "https://cloud-relay.example.com",
      );
      expect(mockService.generateJoinUrl(443, "room1")).toBe(
        "https://cloud-relay.example.com?room=ROOM1",
      );
      expect(mockService.generateJoinUrl(443)).toBe(
        "https://cloud-relay.example.com",
      );
    });

    it("provides fallback defaults when instantiated with no arguments", () => {
      const defaultMock = new MockRelayAddressService();
      expect(defaultMock.isCloudRelay()).toBe(false);
      expect(defaultMock.getLocalLanIp()).toBe("127.0.0.1");
      expect(defaultMock.getAllLanInterfaces()).toEqual(["127.0.0.1"]);
      expect(defaultMock.generateJoinUrl(3000)).toBe("http://127.0.0.1:3000");

      const info = defaultMock.getAddressingInfo(3000);
      expect(info.lanIp).toBe("127.0.0.1");
      expect(info.port).toBe(3000);
      expect(info.interfaces).toEqual(["127.0.0.1"]);
    });
  });

  describe("Branch Edge Cases & Port Defaults", () => {
    it("uses config.port or defaults to 3000 when port is omitted", () => {
      const service1 = new RelayAddressService({
        port: 4200,
        lanIp: "192.168.1.10",
      });
      expect(service1.generateJoinUrl()).toBe("http://192.168.1.10:4200");
      expect(service1.getAddressingInfo().port).toBe(4200);

      const service2 = new RelayAddressService({ lanIp: "192.168.1.10" });
      expect(service2.generateJoinUrl()).toBe("http://192.168.1.10:3000");
      expect(service2.getAddressingInfo().port).toBe(3000);
    });

    it("handles undefined network interface list entry gracefully", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        eth0: undefined as unknown as NetworkInterfaceInfo[],
        eth1: [
          {
            address: "192.168.1.88",
            netmask: "255.255.255.0",
            family: "IPv4",
            mac: "00:11:22:33:44:55",
            internal: false,
            cidr: "192.168.1.88/24",
          },
        ],
      };

      const service = new RelayAddressService({
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      expect(service.getAllLanInterfaces()).toEqual(["192.168.1.88"]);
    });

    it("handles non-Error thrown by networkInterfaceProvider", () => {
      const throwingProvider = {
        getNetworkInterfaces: () => {
          throw "Raw string error";
        },
      };

      const mockLogger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const service = new RelayAddressService({
        networkInterfaceProvider: throwingProvider,
        logger: mockLogger,
      });

      expect(service.getAllLanInterfaces()).toEqual(["127.0.0.1"]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Failed to retrieve network interfaces from provider, falling back to localhost",
        expect.objectContaining({
          error: "Raw string error",
        }),
      );
    });

    it("handles 172.x.x.x where second octet is > 31", () => {
      const mockInterfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
        custom0: [
          {
            address: "172.32.0.1",
            netmask: "255.255.0.0",
            family: "IPv4",
            mac: "00:11:22:33:44:55",
            internal: false,
            cidr: "172.32.0.1/16",
          },
        ],
      };

      const service = new RelayAddressService({
        networkInterfaceProvider: new StaticNetworkInterfaceProvider(
          mockInterfaces,
        ),
      });

      expect(service.getLocalLanIp()).toBe("172.32.0.1");
    });
  });
});
