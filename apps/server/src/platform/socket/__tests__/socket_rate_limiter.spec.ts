import { describe, it, expect, beforeEach } from "vitest";
import {
  SocketRateLimiter,
  extractClientIp,
} from "../index.js";

describe("SocketRateLimiter & Client IP Extraction", () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    limiter = new SocketRateLimiter({
      maxRequests: 5,
      windowMs: 10_000,
    });
  });

  // Existing tests
  it("allows up to maxRequests within the sliding window", () => {
    const socketId = "sock_test_1";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(socketId, now + i * 100)).toBe(true);
    }
  });

  it("rejects requests exceeding maxRequests within the sliding window", () => {
    const socketId = "sock_test_flood";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(socketId, now + i * 100)).toBe(true);
    }

    // 6th request within window must be rejected
    expect(limiter.consume(socketId, now + 600)).toBe(false);
    expect(limiter.check(socketId, now + 600)).toBe(false);
    expect(limiter.getRemaining(socketId, now + 600)).toBe(0);
  });

  it("allows new requests after the sliding window expires", () => {
    const socketId = "sock_test_expiry";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(socketId, now + i * 100)).toBe(true);
    }
    expect(limiter.consume(socketId, now + 600)).toBe(false);

    // After 11_000 ms, all previous burst requests slide out of the 10s window
    const future = now + 11_000;
    expect(limiter.consume(socketId, future)).toBe(true);
    expect(limiter.getRemaining(socketId, future)).toBe(4);
  });

  it("isolates rate limits between different sockets", () => {
    const sockA = "sock_a";
    const sockB = "sock_b";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(sockA, now)).toBe(true);
    }
    expect(limiter.consume(sockA, now)).toBe(false);

    // sockB is unaffected by sockA's limit
    expect(limiter.consume(sockB, now)).toBe(true);
    expect(limiter.getRemaining(sockB, now)).toBe(4);
  });

  it("resets limits for a specific socket on reset()", () => {
    const socketId = "sock_to_reset";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      limiter.consume(socketId, now);
    }
    expect(limiter.consume(socketId, now)).toBe(false);

    limiter.reset(socketId);
    expect(limiter.consume(socketId, now)).toBe(true);
  });

  it("clears all rate limit state on clear()", () => {
    const now = 100_000;
    limiter.consume("sock_1", now);
    limiter.consume("sock_2", now);

    limiter.clear();
    expect(limiter.getRemaining("sock_1", now)).toBe(5);
    expect(limiter.getRemaining("sock_2", now)).toBe(5);
  });

  // New tests covering extractClientIp
  describe("extractClientIp", () => {
    it("extracts the first IP from x-forwarded-for header when comma-separated", () => {
      const socket = {
        handshake: {
          headers: {
            "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
          },
          address: "10.0.0.1",
        },
      };

      expect(extractClientIp(socket as any)).toBe("203.0.113.195");
    });

    it("extracts IP from single-value x-forwarded-for header with surrounding whitespace", () => {
      const socket = {
        handshake: {
          headers: {
            "x-forwarded-for": "  198.51.100.42  ",
          },
          address: "10.0.0.1",
        },
      };

      expect(extractClientIp(socket as any)).toBe("198.51.100.42");
    });

    it("falls back to socket.handshake.address when x-forwarded-for is missing", () => {
      const socket = {
        handshake: {
          headers: {},
          address: "192.168.1.100",
        },
      };

      expect(extractClientIp(socket as any)).toBe("192.168.1.100");
    });

    it("falls back to '127.0.0.1' when neither header nor address is available", () => {
      const socket = {
        handshake: {
          headers: {},
        },
      };

      expect(extractClientIp(socket as any)).toBe("127.0.0.1");
      expect(extractClientIp({} as any)).toBe("127.0.0.1");
    });
  });

  // IP keying & Disconnect behavior
  describe("Client IP keying & Disconnect persistence", () => {
    it("keys rate limiting by client IP across multiple sockets from same IP", () => {
      const clientIp = "203.0.113.50";
      const now = 200_000;

      // Sockets sharing same IP share the rate limit pool
      for (let i = 0; i < 5; i++) {
        expect(limiter.consume(clientIp, now + i * 50)).toBe(true);
      }

      // Exceeded for that IP
      expect(limiter.consume(clientIp, now + 300)).toBe(false);
      expect(limiter.getRemaining(clientIp, now + 300)).toBe(0);
    });

    it("does NOT reset client IP rate limit on socket disconnect so window expires naturally", () => {
      const clientIp = "198.51.100.25";
      const now = 200_000;

      for (let i = 0; i < 5; i++) {
        limiter.consume(clientIp, now + i * 50);
      }

      // Socket disconnects — we do NOT call limiter.reset(clientIp)
      // Attempting to reconnect immediately and spam must still be blocked
      expect(limiter.consume(clientIp, now + 300)).toBe(false);
      expect(limiter.check(clientIp, now + 300)).toBe(false);

      // Only after window expires (10s later) should requests be allowed
      const future = now + 11_000;
      expect(limiter.consume(clientIp, future)).toBe(true);
    });
  });

  // prune() method tests
  describe("prune()", () => {
    it("removes expired timestamps and cleans up keys with empty timestamp arrays", () => {
      const now = 300_000;
      limiter.consume("client-old", now - 15_000); // Expired (older than 10s)
      limiter.consume("client-fresh", now - 2_000); // Valid

      // Before prune: getRemaining considers expired on check
      expect(limiter.getRemaining("client-old", now)).toBe(5);
      expect(limiter.getRemaining("client-fresh", now)).toBe(4);

      // prune removes client-old from internal map
      limiter.prune(now);

      // client-fresh still tracked
      expect(limiter.getRemaining("client-fresh", now)).toBe(4);

      // Now advance time so client-fresh also expires
      limiter.prune(now + 12_000);
      expect(limiter.getRemaining("client-fresh", now + 12_000)).toBe(5);
    });
  });
});
