import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SocketRateLimiter,
  createSocketRateLimiter,
  extractClientIp,
} from "../index.js";
import { NullLogger } from "../../logger/null_logger.js";

type SocketLikeParam = Parameters<typeof extractClientIp>[0];

describe("SocketRateLimiter & Client IP Extraction", () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    limiter = new SocketRateLimiter({
      maxRequests: 5,
      windowMs: 10_000,
    });
  });

  afterEach(() => {
    limiter.destroy();
  });

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

  describe("extractClientIp (CRIT-006)", () => {
    it("ignores x-forwarded-for by default (trustProxy = false) and uses address to prevent spoofing (CRIT-001)", () => {
      const socket = {
        handshake: {
          headers: {
            "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
          },
          address: "10.0.0.1",
        },
      };

      expect(extractClientIp(socket as SocketLikeParam)).toBe("10.0.0.1");
      expect(extractClientIp(socket as SocketLikeParam, false)).toBe("10.0.0.1");
    });

    it("extracts the RIGHTMOST IP from x-forwarded-for header when trustProxy is true (CRIT-006)", () => {
      const socket = {
        handshake: {
          headers: {
            "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
          },
          address: "10.0.0.1",
        },
      };

      expect(extractClientIp(socket as SocketLikeParam, true)).toBe("150.172.238.178");
    });

    it("extracts the rightmost IP when x-forwarded-for header is an array when trustProxy is true", () => {
      const socket = {
        handshake: {
          headers: {
            "x-forwarded-for": ["203.0.113.195", "198.51.100.99"],
          },
          address: "10.0.0.1",
        },
      };

      expect(extractClientIp(socket as SocketLikeParam, true)).toBe("198.51.100.99");
    });

    it("extracts IP from single-value x-forwarded-for header with surrounding whitespace when trustProxy is true", () => {
      const socket = {
        handshake: {
          headers: {
            "x-forwarded-for": "  198.51.100.42  ",
          },
          address: "10.0.0.1",
        },
      };

      expect(extractClientIp(socket as SocketLikeParam, true)).toBe("198.51.100.42");
    });

    it("falls back to socket.handshake.address when x-forwarded-for is missing", () => {
      const socket = {
        handshake: {
          headers: {},
          address: "192.168.1.100",
        },
      };

      expect(extractClientIp(socket as SocketLikeParam)).toBe("192.168.1.100");
      expect(extractClientIp(socket as SocketLikeParam, true)).toBe("192.168.1.100");
    });

    it("falls back to conn.remoteAddress when handshake.address is missing", () => {
      const socket = {
        handshake: {
          headers: {},
        },
        conn: {
          remoteAddress: "172.16.0.5",
        },
      };

      expect(extractClientIp(socket as SocketLikeParam)).toBe("172.16.0.5");
      expect(extractClientIp(socket as SocketLikeParam, true)).toBe("172.16.0.5");
    });

    it("fails closed to 'unknown' when neither header nor address is available (CRIT-001)", () => {
      const socket = {
        handshake: {
          headers: {},
        },
      };

      expect(extractClientIp(socket as SocketLikeParam)).toBe("unknown");
      expect(extractClientIp({} as SocketLikeParam)).toBe("unknown");
    });
  });

  describe("Bounded LRU Memory Eviction (MAJ-003)", () => {
    it("evicts the oldest key when capacity exceeds maxKeys on inserting a new key", () => {
      const smallLimiter = new SocketRateLimiter({
        maxRequests: 5,
        windowMs: 10_000,
        maxKeys: 3,
        pruneIntervalMs: 0,
      });

      const now = 100_000;
      smallLimiter.consume("client-1", now);
      smallLimiter.consume("client-2", now);
      smallLimiter.consume("client-3", now);
      expect(smallLimiter.size()).toBe(3);

      // Consuming client-4 must evict the oldest key ("client-1")
      smallLimiter.consume("client-4", now);
      expect(smallLimiter.size()).toBe(3);

      // "client-1" was evicted, so its quota was reset
      expect(smallLimiter.getRemaining("client-1", now)).toBe(5);
      // "client-2", "client-3", "client-4" are still present
      expect(smallLimiter.getRemaining("client-2", now)).toBe(4);
      expect(smallLimiter.getRemaining("client-3", now)).toBe(4);
      expect(smallLimiter.getRemaining("client-4", now)).toBe(4);

      smallLimiter.destroy();
    });

    it("refreshes LRU position on access so recently active keys are retained", () => {
      const smallLimiter = new SocketRateLimiter({
        maxRequests: 5,
        windowMs: 10_000,
        maxKeys: 3,
        pruneIntervalMs: 0,
      });

      const now = 100_000;
      smallLimiter.consume("client-1", now);
      smallLimiter.consume("client-2", now);
      smallLimiter.consume("client-3", now);

      // Re-access client-1 so it becomes the most recently used
      smallLimiter.consume("client-1", now + 10);

      // Now insert client-4: client-2 should be evicted (oldest LRU), not client-1
      smallLimiter.consume("client-4", now + 20);
      expect(smallLimiter.size()).toBe(3);

      // client-1 was retained
      expect(smallLimiter.getRemaining("client-1", now + 20)).toBe(3);
      // client-2 was evicted
      expect(smallLimiter.getRemaining("client-2", now + 20)).toBe(5);

      smallLimiter.destroy();
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

  // prune() method tests and scheduled logging (MAJ-015)
  describe("prune() & Logged Background Job (MAJ-015)", () => {
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

    it("logs background pruning job when logger is provided and timer triggers (MAJ-015)", async () => {
      vi.useFakeTimers();
      try {
        const logger = new NullLogger();
        const loggedLimiter = new SocketRateLimiter({
          maxRequests: 5,
          windowMs: 1000,
          pruneIntervalMs: 500,
          logger,
        });

        loggedLimiter.consume("expired-key", Date.now() - 2000);

        // Advance timer to trigger prune interval
        await vi.advanceTimersByTimeAsync(550);

        const pruneStart = logger.infoLogs.find(
          (l) => l.context?.["operation"] === "rate_limiter_prune" && l.context?.["status"] === "started",
        );
        const pruneSuccess = logger.infoLogs.find(
          (l) => l.context?.["operation"] === "rate_limiter_prune" && l.context?.["status"] === "success",
        );

        expect(pruneStart).toBeDefined();
        expect(pruneSuccess).toBeDefined();
        expect(pruneSuccess?.context?.["correlationId"]).toBeDefined();

        loggedLimiter.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("re-throws errors during prune without redundant local logging (MIN-007)", () => {
      const logger = new NullLogger();
      const limiter = new SocketRateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        pruneIntervalMs: 0,
        logger,
      });

      // Force timestamps iteration to throw
      const errorMap = {
        entries: () => {
          throw new Error("Simulated map iteration crash");
        },
      };
      (limiter as unknown as { timestamps: unknown }).timestamps = errorMap;

      expect(() => limiter.prune(Date.now())).toThrow("Simulated map iteration crash");
      // Verify prune() does not emit redundant local error logs
      expect(logger.errorLogs).toHaveLength(0);
    });

    it("logs failure via runLoggedJob with correlationId when background prune interval fails (MIN-007)", async () => {
      vi.useFakeTimers();
      try {
        const logger = new NullLogger();
        const limiter = new SocketRateLimiter({
          maxRequests: 5,
          windowMs: 1000,
          pruneIntervalMs: 500,
          logger,
        });

        // Force timestamps iteration to throw
        const errorMap = {
          entries: () => {
            throw new Error("Simulated background prune failure");
          },
          clear: () => {},
        };
        (limiter as unknown as { timestamps: unknown }).timestamps = errorMap;

        // Advance timers to trigger background prune interval
        await vi.advanceTimersByTimeAsync(550);

        // runLoggedJob emits 3-point logging: started and failed
        const failedLog = logger.errorLogs.find(
          (l) => l.context?.["operation"] === "rate_limiter_prune" && l.context?.["status"] === "failed",
        );
        expect(failedLog).toBeDefined();
        expect(failedLog?.context?.["correlationId"]).toBeDefined();
        expect(failedLog?.context?.["durationMs"]).toBeTypeOf("number");
        expect((failedLog?.context?.["error"] as { message?: string })?.message).toBe(
          "Simulated background prune failure",
        );

        limiter.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it("prunes partially expired timestamps when valid.length < list.length", () => {
      const now = 500_000;
      limiter.consume("partial-client", now - 15_000); // expired
      limiter.consume("partial-client", now - 2_000); // active
      expect(limiter.getRemaining("partial-client", now)).toBe(4);

      const deleted = limiter.prune(now);
      expect(deleted).toBe(0); // not deleted because 1 valid remains
      expect(limiter.getRemaining("partial-client", now)).toBe(4);
    });

    it("check() and getRemaining() clean up key when all existing timestamps have expired", () => {
      const now = 600_000;
      limiter.consume("all-expired", now - 15_000);

      // check() triggers cleanup
      expect(limiter.check("all-expired", now)).toBe(true);

      // re-consume and test getRemaining cleanup
      limiter.consume("all-expired-2", now - 15_000);
      expect(limiter.getRemaining("all-expired-2", now)).toBe(5);
    });
  });

  describe("createSocketRateLimiter & getLimitDescription", () => {
    it("creates configured instance and returns human-readable limit description", () => {
      const instance = createSocketRateLimiter({ maxRequests: 20, windowMs: 5_000 });
      expect(instance.getLimitDescription()).toBe("Maximum 20 requests per 5 seconds allowed.");
      instance.destroy();

      const defaultInstance = createSocketRateLimiter();
      expect(defaultInstance.getLimitDescription()).toBe("Maximum 60 requests per 10 seconds allowed.");
      defaultInstance.destroy();
    });
  });
});
