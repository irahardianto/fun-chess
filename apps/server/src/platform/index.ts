/**
 * Public API for apps/server/src/platform.
 * Cross-module callers should import platform modules via these barrel entry points.
 */
export * from "./config/index.js";
export * from "./http/index.js";
export {
  createSocketServer,
  createSocketRateLimiter,
  SocketRateLimiter,
  wrapSocketHandler,
  type TypedSocketServer,
} from "./socket/index.js";
export * from "./logger/index.js";
export * from "./time/index.js";
export * from "./lifecycle/index.js";
export * from "./rate_limiter/index.js";
