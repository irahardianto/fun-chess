import { Socket } from "socket.io";
import type { z } from "zod";
import type { Logger } from "../logger/index.js";
import { wrapSocketHandler, type SocketOperationContext } from "./socket_logging_middleware.js";
import type { SocketRateLimiter } from "./socket_rate_limiter.js";

const OPERATION_RATE_LIMIT_DESCRIPTIONS: Record<string, string> = {
  "room:create": "room creation",
  "room:join": "room joining",
  "room:reconnect": "room reconnection",
  "room:leave": "room leave",
  "game:move": "game moves",
  "game:resign": "game resignation",
  "game:offer_draw": "draw offers",
  "game:respond_draw": "draw responses",
  "game:request_rematch": "rematch requests",
  "game:respond_rematch": "rematch responses",
};

export interface FeatureSocketHandlerOptions<TReq> {
  schema?: z.ZodType<TReq>;
  rateLimiter: SocketRateLimiter;
  trustProxy?: boolean;
}

/**
 * Reusable strictly typed wrapper for feature socket handlers (MAJ-021).
 * Consolidates rate-limit proxy logging, operation-specific error description customization,
 * and delegates to the platform wrapSocketHandler.
 */
export function createFeatureSocketHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socket: Socket,
  options: FeatureSocketHandlerOptions<TReq>,
  handler: (req: TReq, context: SocketOperationContext) => Promise<TRes>,
): (rawReq: unknown, callback?: (res: unknown) => void) => Promise<void> {
  const getMessage = (op: string): string => {
    const limitDesc = options.rateLimiter.getLimitDescription();
    const opDesc = OPERATION_RATE_LIMIT_DESCRIPTIONS[op];
    if (opDesc) {
      return `Rate limit exceeded for ${opDesc}. ${limitDesc}`;
    }
    return `Rate limit exceeded for ${op}. ${limitDesc}`;
  };

  const proxiedSocket = new Proxy(socket, {
    get(target, prop, receiver) {
      if (prop === "emit") {
        return (event: string, ...args: unknown[]) => {
          const firstArg = args[0] as { code?: string; message?: string } | undefined;
          if (event === "error" && firstArg?.code === "ERR_RATE_LIMITED") {
            firstArg.message = getMessage(operationName);
          }
          return (target as unknown as { emit: (e: string, ...a: unknown[]) => unknown }).emit(
            event,
            ...args,
          );
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const rateLimitLogger: Logger = new Proxy(logger, {
    get(target, prop, receiver) {
      if (prop === "warn") {
        return (msg: string, meta?: Record<string, unknown>) => {
          if (msg === "Operation rate limit exceeded" && meta?.operation) {
            target.warn("Operation rate limit exceeded", meta);
          } else {
            target.warn(msg, meta);
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const wrapped = wrapSocketHandler<TReq, TRes>(
    rateLimitLogger,
    operationName,
    proxiedSocket,
    options,
    handler,
  );

  return async (rawReq: unknown, callback?: (res: unknown) => void): Promise<void> => {
    await wrapped(
      rawReq,
      callback
        ? (res: unknown) => {
            callback(res);
          }
        : undefined,
    );
  };
}
