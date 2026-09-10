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
 * Formats operation-specific rate limit error description (ENH-006).
 */
export function formatOperationRateLimitMessage(
  op: string,
  defaultLimitDesc: string,
): string {
  const opDesc = OPERATION_RATE_LIMIT_DESCRIPTIONS[op];
  if (opDesc) {
    return `Rate limit exceeded for ${opDesc}. ${defaultLimitDesc}`;
  }
  return `Rate limit exceeded for ${op}. ${defaultLimitDesc}`;
}

/**
 * Reusable strictly typed wrapper for feature socket handlers (MAJ-021).
 * Eliminates ES6 dynamic proxies (ENH-006) by providing custom rate limit error formatting
 * directly to the platform wrapSocketHandler.
 */
export function createFeatureSocketHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socket: Socket,
  options: FeatureSocketHandlerOptions<TReq>,
  handler: (req: TReq, context: SocketOperationContext) => Promise<TRes>,
): (rawReq: unknown, callback?: (res: unknown) => void) => Promise<void> {
  const wrapped = wrapSocketHandler<TReq, TRes>(
    logger,
    operationName,
    socket,
    {
      schema: options.schema,
      rateLimiter: options.rateLimiter,
      trustProxy: options.trustProxy,
      rateLimitErrorMessage: formatOperationRateLimitMessage,
    },
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
