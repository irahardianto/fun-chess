import { describe, it, expect, vi, afterEach } from "vitest";
import { SlidingWindowRateLimiter } from "../sliding_window_rate_limiter.js";
import { NullLogger } from "../../logger/null_logger.js";

describe("SlidingWindowRateLimiter", () => {
  let limiter: SlidingWindowRateLimiter;
  const nullLogger = new NullLogger();

  afterEach(() => {
    limiter?.destroy();
  });

  describe("consume and rate limiting", () => {
    it("allows requests up to maxRequests within window and rejects when exceeded", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 3,
        windowMs: 10_000,
        pruneIntervalMs: 0,
        logger: nullLogger,
      });

      const key = "client-1";
      const baseTime = 1_000_000;

      expect(limiter.consume(key, baseTime)).toBe(true);
      expect(limiter.consume(key, baseTime + 1000)).toBe(true);
      expect(limiter.consume(key, baseTime + 2000)).toBe(true);

      // 4th request within window should be rejected
      expect(limiter.consume(key, baseTime + 3000)).toBe(false);

      // After window slides past baseTime, an allowance opens up
      expect(limiter.consume(key, baseTime + 10_001)).toBe(true);
    });

    it("tracks independent limits per key", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 2,
        windowMs: 5_000,
        pruneIntervalMs: 0,
        logger: nullLogger,
      });

      const now = 1000;
      expect(limiter.consume("ip-a", now)).toBe(true);
      expect(limiter.consume("ip-a", now)).toBe(true);
      expect(limiter.consume("ip-a", now)).toBe(false);

      // ip-b should still be allowed
      expect(limiter.consume("ip-b", now)).toBe(true);
      expect(limiter.consume("ip-b", now)).toBe(true);
      expect(limiter.consume("ip-b", now)).toBe(false);
    });

    it("uses default options when instantiated without arguments", () => {
      limiter = new SlidingWindowRateLimiter();
      expect(limiter.getLimitDescription()).toContain("Maximum 60 requests per 10 seconds allowed.");
      expect(limiter.consume("test-key")).toBe(true);
    });
  });

  describe("check and getRemaining", () => {
    it("returns correct values for check and getRemaining without consuming", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 3,
        windowMs: 10_000,
        pruneIntervalMs: 0,
        logger: nullLogger,
      });

      const key = "client-check";
      const now = 50_000;

      // Initially untouched key
      expect(limiter.check(key, now)).toBe(true);
      expect(limiter.getRemaining(key, now)).toBe(3);

      limiter.consume(key, now);
      expect(limiter.check(key, now)).toBe(true);
      expect(limiter.getRemaining(key, now)).toBe(2);

      limiter.consume(key, now + 1000);
      expect(limiter.check(key, now + 1000)).toBe(true);
      expect(limiter.getRemaining(key, now + 1000)).toBe(1);

      limiter.consume(key, now + 2000);
      expect(limiter.check(key, now + 2000)).toBe(false);
      expect(limiter.getRemaining(key, now + 2000)).toBe(0);

      // After window passes
      expect(limiter.check(key, now + 15_000)).toBe(true);
      expect(limiter.getRemaining(key, now + 15_000)).toBe(3);
    });
  });

  describe("bounded LRU eviction when maxKeys is reached", () => {
    it("evicts oldest key when maxKeys limit is reached", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 5,
        windowMs: 60_000,
        maxKeys: 2,
        pruneIntervalMs: 0,
        logger: nullLogger,
      });

      const now = 100_000;
      limiter.consume("key-1", now);
      limiter.consume("key-2", now);
      expect(limiter.size()).toBe(2);

      // Consuming key-3 should evict key-1 (oldest key)
      limiter.consume("key-3", now);
      expect(limiter.size()).toBe(2);
      expect(limiter.getRemaining("key-1", now)).toBe(5); // fresh key since key-1 was evicted
      expect(limiter.getRemaining("key-2", now)).toBe(4);
      expect(limiter.getRemaining("key-3", now)).toBe(4);
    });

    it("updates LRU order on key access", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 5,
        windowMs: 60_000,
        maxKeys: 2,
        pruneIntervalMs: 0,
        logger: nullLogger,
      });

      const now = 100_000;
      limiter.consume("key-1", now);
      limiter.consume("key-2", now);

      // Touch key-1 so key-2 becomes the oldest
      limiter.consume("key-1", now + 10);

      // Adding key-3 should now evict key-2
      limiter.consume("key-3", now + 20);
      expect(limiter.size()).toBe(2);
      expect(limiter.getRemaining("key-2", now + 20)).toBe(5); // key-2 was evicted
      expect(limiter.getRemaining("key-1", now + 20)).toBe(3); // 2 requests consumed
    });
  });

  describe("prune method", () => {
    it("removes expired timestamps and entirely removes keys with no active timestamps", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 5,
        windowMs: 10_000,
        pruneIntervalMs: 0,
        logger: nullLogger,
      });

      const baseTime = 100_000;

      // key-1: all timestamps will expire
      limiter.consume("key-1", baseTime);

      // key-2: partially expired timestamps (tests valid.length < times.length branch)
      limiter.consume("key-2", baseTime);
      limiter.consume("key-2", baseTime + 15_000);

      expect(limiter.size()).toBe(2);

      // Prune at baseTime + 12_000:
      // Cutoff is 122_000 - 10_000 = 112_000
      // key-1 has timestamp 100_000 <= 112_000 -> deleted (count: 1)
      // key-2 has 100_000 (expired) and 115_000 (valid) -> pruned 1 timestamp, kept
      const deletedKeys = limiter.prune(baseTime + 22_000);
      expect(deletedKeys).toBe(1);
      expect(limiter.size()).toBe(1);
      expect(limiter.getRemaining("key-2", baseTime + 22_000)).toBe(4);
    });
  });

  describe("state cleanup: reset, clear, destroy", () => {
    it("reset removes a specific key", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 2,
        windowMs: 10_000,
        pruneIntervalMs: 0,
        logger: nullLogger,
      });

      limiter.consume("key-1");
      limiter.consume("key-2");
      expect(limiter.size()).toBe(2);

      limiter.reset("key-1");
      expect(limiter.size()).toBe(1);
      expect(limiter.getRemaining("key-1")).toBe(2);
    });

    it("clear removes all tracked keys", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 2,
        windowMs: 10_000,
        pruneIntervalMs: 0,
        logger: nullLogger,
      });

      limiter.consume("key-1");
      limiter.consume("key-2");
      expect(limiter.size()).toBe(2);

      limiter.clear();
      expect(limiter.size()).toBe(0);
    });

    it("destroy clears state and cancels background prune timer", () => {
      limiter = new SlidingWindowRateLimiter({
        maxRequests: 5,
        windowMs: 10_000,
        pruneIntervalMs: 1_000,
        logger: nullLogger,
      });

      limiter.consume("key-1");
      expect(limiter.size()).toBe(1);

      limiter.destroy();
      expect(limiter.size()).toBe(0);

      // Calling destroy a second time is safe
      expect(() => limiter.destroy()).not.toThrow();
    });

    it("executes periodic prune via timer when pruneIntervalMs > 0", async () => {
      vi.useFakeTimers();
      try {
        limiter = new SlidingWindowRateLimiter({
          maxRequests: 5,
          windowMs: 1000,
          pruneIntervalMs: 2000,
          logger: nullLogger,
        });

        limiter.consume("key-1", 1000);
        expect(limiter.size()).toBe(1);

        // Advance past window and prune interval
        vi.advanceTimersByTime(2500);

        // Timer executed prune
        expect(limiter.size()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
