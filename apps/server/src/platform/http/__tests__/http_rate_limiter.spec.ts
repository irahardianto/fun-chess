import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HttpRateLimiter } from "../http_rate_limiter.js";
import { NullLogger } from "../../logger/null_logger.js";

describe("HttpRateLimiter", () => {
  let limiter: HttpRateLimiter;

  beforeEach(() => {
    limiter = new HttpRateLimiter({
      maxRequests: 5,
      windowMs: 10_000,
      logger: new NullLogger(),
    });
  });

  afterEach(() => {
    limiter.destroy();
  });

  it("allows requests up to maxRequests within the sliding window", () => {
    const ip = "192.168.1.50";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(ip, now + i * 10)).toBe(true);
    }
  });

  it("blocks requests exceeding maxRequests within window and checks remaining", () => {
    const ip = "192.168.1.51";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(ip, now + i * 10)).toBe(true);
    }

    // 6th request within window must be rejected
    expect(limiter.consume(ip, now + 60)).toBe(false);
    expect(limiter.check(ip, now + 60)).toBe(false);
    expect(limiter.getRemaining(ip, now + 60)).toBe(0);
  });

  it("allows new requests after sliding window expiration", () => {
    const ip = "192.168.1.52";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume(ip, now + i * 10)).toBe(true);
    }
    expect(limiter.consume(ip, now + 60)).toBe(false);

    // After 10_001ms, window slides
    const future = now + 11_000;
    expect(limiter.consume(ip, future)).toBe(true);
    expect(limiter.getRemaining(ip, future)).toBe(4);
  });

  it("resets quota for a specific client IP", () => {
    const ip = "192.168.1.53";
    const now = 100_000;

    for (let i = 0; i < 5; i++) {
      limiter.consume(ip, now + i * 10);
    }
    expect(limiter.check(ip, now + 60)).toBe(false);

    limiter.reset(ip);
    expect(limiter.check(ip, now + 60)).toBe(true);
    expect(limiter.getRemaining(ip, now + 60)).toBe(5);
  });

  it("clears all tracked IPs", () => {
    const ip1 = "10.0.0.1";
    const ip2 = "10.0.0.2";
    const now = 100_000;

    limiter.consume(ip1, now);
    limiter.consume(ip2, now);

    limiter.clear();
    expect(limiter.getRemaining(ip1, now)).toBe(5);
    expect(limiter.getRemaining(ip2, now)).toBe(5);
  });

  it("uses default options when instantiated without arguments", () => {
    const defaultLimiter = new HttpRateLimiter();
    expect(defaultLimiter.consume("127.0.0.1")).toBe(true);
    expect(defaultLimiter.getRemaining("127.0.0.1")).toBe(99);
    defaultLimiter.destroy();
  });
});
