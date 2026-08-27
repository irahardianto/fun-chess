import { describe, it, expect, beforeEach } from "vitest";
import { SocketRateLimiter } from "../socket_rate_limiter.js";

describe("SocketRateLimiter", () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    limiter = new SocketRateLimiter({
      maxRequests: 5,
      windowMs: 10_000,
    });
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
});
