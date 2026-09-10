import { describe, it, expect } from "vitest";
import { extractClientIp, normalizeIp } from "../ip_utils.js";
import type { IncomingMessage } from "node:http";

describe("ip_utils", () => {
  describe("normalizeIp", () => {
    it("normalizes IPv4-mapped IPv6 addresses by stripping ::ffff: (ENH-001)", () => {
      expect(normalizeIp("::ffff:192.168.1.42")).toBe("192.168.1.42");
      expect(normalizeIp("::ffff:10.0.0.1")).toBe("10.0.0.1");
    });

    it("trims whitespace from raw IP strings", () => {
      expect(normalizeIp("  192.168.1.10  ")).toBe("192.168.1.10");
    });

    it("fails closed to unknown on undefined or empty inputs (CRIT-001)", () => {
      expect(normalizeIp(undefined)).toBe("unknown");
      expect(normalizeIp("")).toBe("unknown");
      expect(normalizeIp("   ")).toBe("unknown");
    });

    it("leaves standard IPv4 and IPv6 addresses intact", () => {
      expect(normalizeIp("127.0.0.1")).toBe("127.0.0.1");
      expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1");
    });

    it("fails closed to unknown for invalid IP syntax via net.isIP (MIN-002, CRIT-001)", () => {
      expect(normalizeIp("invalid.ip.string")).toBe("unknown");
      expect(normalizeIp("999.999.999.999")).toBe("unknown");
      expect(normalizeIp("1.2.3.4.5")).toBe("unknown");
      expect(normalizeIp("hello world")).toBe("unknown");
    });
  });

  describe("extractClientIp", () => {
    it("ignores x-forwarded-for when trustProxy is false to prevent spoofing (CRIT-001)", () => {
      const req = {
        headers: {
          "x-forwarded-for": "203.0.113.195",
        },
        socket: {
          remoteAddress: "192.168.1.5",
        },
      } as unknown as IncomingMessage;

      const ip = extractClientIp(req, false);
      expect(ip).toBe("192.168.1.5");
    });

    it("extracts rightmost IP from x-forwarded-for in multi-hop proxies when trustProxy is true (ENH-002, CRIT-006)", () => {
      const req = {
        headers: {
          "x-forwarded-for": "client.spoofed.ip, 198.51.100.10, 203.0.113.50",
        },
        socket: {
          remoteAddress: "10.0.0.1",
        },
      } as unknown as IncomingMessage;

      const ip = extractClientIp(req, true);
      expect(ip).toBe("203.0.113.50");
    });

    it("normalizes ::ffff: when extracted from x-forwarded-for (ENH-001)", () => {
      const req = {
        headers: {
          "x-forwarded-for": "::ffff:203.0.113.77",
        },
        socket: {
          remoteAddress: "127.0.0.1",
        },
      } as unknown as IncomingMessage;

      const ip = extractClientIp(req, true);
      expect(ip).toBe("203.0.113.77");
    });

    it("extracts IP from socket handshake and connection objects", () => {
      const socket = {
        handshake: {
          headers: {
            "x-forwarded-for": "198.51.100.22",
          },
          address: "10.0.0.2",
        },
      };

      expect(extractClientIp(socket, true)).toBe("198.51.100.22");
      expect(extractClientIp(socket, false)).toBe("10.0.0.2");
    });

    it("handles array x-forwarded-for headers cleanly", () => {
      const req = {
        headers: {
          "x-forwarded-for": ["192.168.1.1", "203.0.113.88"],
        },
        socket: {
          remoteAddress: "10.0.0.1",
        },
      } as unknown as IncomingMessage;

      const ip = extractClientIp(req, true);
      expect(ip).toBe("203.0.113.88");
    });

    it("fails closed to unknown on null or empty source (CRIT-001)", () => {
      expect(extractClientIp(null)).toBe("unknown");
      expect(extractClientIp({})).toBe("unknown");
    });
  });
});
