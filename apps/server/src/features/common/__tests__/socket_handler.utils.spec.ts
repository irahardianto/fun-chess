import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createFeatureSocketHandler } from "../socket_handler.utils.js";
import { SocketRateLimiter } from "../../../platform/socket/socket_rate_limiter.js";
import type { Logger } from "../../../platform/logger/index.js";

describe("createFeatureSocketHandler", () => {
  function createMockLogger(): Logger {
    return {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
  }

  function createMockSocket(overrides: Record<string, unknown> = {}) {
    return {
      id: "test_sock_1",
      handshake: { address: "127.0.0.1", headers: {} },
      emit: vi.fn(),
      ...overrides,
    } as any;
  }

  it("handles successful request with schema validation and callback", async () => {
    const logger = createMockLogger();
    const socket = createMockSocket();
    const rateLimiter = new SocketRateLimiter({ maxRequests: 10, windowMs: 1000 });

    const schema = z.object({
      name: z.string(),
      count: z.number(),
    });

    const handler = vi.fn(async (req: { name: string; count: number }) => {
      return { success: true, processedName: req.name.toUpperCase() };
    });

    const wrapped = createFeatureSocketHandler(
      logger,
      "room:create",
      socket,
      { schema, rateLimiter },
      handler,
    );

    const callback = vi.fn();
    await wrapped({ name: "alice", count: 42 }, callback);

    expect(handler).toHaveBeenCalledWith(
      { name: "alice", count: 42 },
      expect.objectContaining({ socketId: "test_sock_1" }),
    );
    expect(callback).toHaveBeenCalledWith({
      success: true,
      processedName: "ALICE",
    });
  });

  it("validates schema and rejects invalid payload with ERR_VALIDATION_FAILED", async () => {
    const logger = createMockLogger();
    const socket = createMockSocket();
    const rateLimiter = new SocketRateLimiter({ maxRequests: 10, windowMs: 1000 });

    const schema = z.object({
      code: z.string().length(4),
    });

    const handler = vi.fn();
    const wrapped = createFeatureSocketHandler(
      logger,
      "room:join",
      socket,
      { schema, rateLimiter },
      handler,
    );

    const callback = vi.fn();
    await wrapped({ code: "TOO_LONG" }, callback);

    expect(handler).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "ERR_INVALID_PAYLOAD",
        }),
      }),
    );
  });

  it("rate limits requests, formats custom operation description, and avoids duplicate warning logs", async () => {
    const logger = createMockLogger();
    const socket = createMockSocket();
    // Configure rate limiter with only 1 allowed request
    const rateLimiter = new SocketRateLimiter({ maxRequests: 1, windowMs: 10000 });

    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = createFeatureSocketHandler(
      logger,
      "room:create",
      socket,
      { rateLimiter },
      handler,
    );

    // 1st request: should succeed
    const callback1 = vi.fn();
    await wrapped({}, callback1);
    expect(handler).toHaveBeenCalledTimes(1);

    // 2nd request: should be rate-limited
    const callback2 = vi.fn();
    await wrapped({}, callback2);
    expect(handler).toHaveBeenCalledTimes(1);

    // Rate limited response via callback
    expect(callback2).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "ERR_RATE_LIMITED",
        }),
      }),
    );

    // Assert that logger.warn was called exactly once for the rate limit event (no duplicate logs)
    const warnCalls = (logger.warn as any).mock.calls;
    const rateLimitWarns = warnCalls.filter((call: any[]) =>
      call[0]?.includes("Rate limit exceeded"),
    );
    expect(rateLimitWarns.length).toBe(1);
    expect(rateLimitWarns[0][0]).toBe("Rate limit exceeded for room:create");
  });

  it("customizes message for socket.emit on rate limit", async () => {
    const logger = createMockLogger();
    const socket = createMockSocket();
    const rateLimiter = new SocketRateLimiter({ maxRequests: 1, windowMs: 10000 });

    const handler = vi.fn(async () => ({ ok: true }));
    const wrapped = createFeatureSocketHandler(
      logger,
      "game:move",
      socket,
      { rateLimiter },
      handler,
    );

    // 1st request succeeds
    await wrapped({});

    // 2nd request throttles and emits "error" without a callback
    await wrapped({});

    expect(socket.emit).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({
        code: "ERR_RATE_LIMITED",
        message: expect.stringContaining("Rate limit exceeded for game moves"),
      }),
    );
  });
});
