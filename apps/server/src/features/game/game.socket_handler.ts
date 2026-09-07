import { Socket } from "socket.io";
import {
  MakeMoveRequest,
  MakeMoveRequestSchema,
  ResignRequest,
  ResignRequestSchema,
  OfferDrawRequest,
  OfferDrawRequestSchema,
  RespondDrawRequest,
  RespondDrawRequestSchema,
  RequestRematchRequest,
  RequestRematchRequestSchema,
  RespondRematchRequest,
  RespondRematchRequestSchema,
  MoveResult,
} from "@fun-chess/shared";
import { Logger } from "../../platform/logger/logger.interface.js";
import { wrapSocketHandler } from "../../platform/socket/socket_logging_middleware.js";
import {
  SocketRateLimiter,
  createSocketRateLimiter,
} from "../../platform/socket/socket_rate_limiter.js";
import type { IGameService } from "./game.interface.js";
import { TypedSocketServer } from "../../platform/socket/socket_server.js";
import {
  type IDisconnectTimerRegistry,
  defaultDisconnectTimerRegistry,
  cancelAllDisconnectTimersForRoom,
} from "../rooms/index.js";

function createGameHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socket: Socket,
  options: { schema: any; rateLimiter: SocketRateLimiter },
  handler: (req: TReq, context: any) => Promise<TRes>,
) {
  const rateLimitLogger: Logger = new Proxy(logger, {
    get(target, prop, receiver) {
      if (prop === "warn") {
        return (msg: string, meta?: Record<string, unknown>) => {
          target.warn(msg, meta);
          if (msg === "Operation rate limit exceeded" && meta?.operation) {
            target.warn(`Rate limit exceeded for ${meta.operation}`, meta);
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const getMessage = (op: string) => {
    switch (op) {
      case "game:move":
        return "Rate limit exceeded for game moves. Maximum 5 requests per 10 seconds allowed.";
      case "game:resign":
        return "Rate limit exceeded for game resignation. Maximum 5 requests per 10 seconds allowed.";
      case "game:offer_draw":
        return "Rate limit exceeded for draw offers. Maximum 5 requests per 10 seconds allowed.";
      case "game:respond_draw":
        return "Rate limit exceeded for draw responses. Maximum 5 requests per 10 seconds allowed.";
      case "game:request_rematch":
        return "Rate limit exceeded for rematch requests. Maximum 5 requests per 10 seconds allowed.";
      case "game:respond_rematch":
        return "Rate limit exceeded for rematch responses. Maximum 5 requests per 10 seconds allowed.";
      default:
        return `Rate limit exceeded for ${op}. Maximum 5 requests per 10 seconds allowed.`;
    }
  };

  const proxiedSocket = new Proxy(socket, {
    get(target, prop, receiver) {
      if (prop === "emit") {
        return (event: string, ...args: any[]) => {
          if (event === "error" && args[0]?.code === "ERR_RATE_LIMITED") {
            args[0].message = getMessage(operationName);
          }
          return (target as any).emit(event, ...args);
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

  return (rawReq: unknown, callback?: (res: any) => void) => {
    return wrapped(
      rawReq,
      callback
        ? (res: any) => {
            if (res?.error?.code === "ERR_RATE_LIMITED") {
              res.error.message = getMessage(operationName);
            }
            callback(res);
          }
        : undefined,
    );
  };
}

/**
 * Registers gameplay Socket.io event listeners.
 */
export function registerGameSocketHandlers(
  io: TypedSocketServer,
  socket: Socket,
  gameService: IGameService,
  logger: Logger,
  rateLimiter: SocketRateLimiter = createSocketRateLimiter(),
  timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): void {
  // 1. game:move
  const handleMove = createGameHandler<
    MakeMoveRequest,
    { success: true; moveResult: MoveResult }
  >(
    logger,
    "game:move",
    socket,
    { schema: MakeMoveRequestSchema, rateLimiter },
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.makeMove(req, socket.id);

      io.to(roomCode).emit("game:moved", {
        move: result.moveResult,
        gameState: result.gameState,
      });

      if (result.checkInfo) {
        io.to(roomCode).emit("game:check", result.checkInfo);
      }

      if (result.gameOverPayload) {
        timerRegistry.cancelAllForRoom(roomCode);
        io.to(roomCode).emit("game:over", result.gameOverPayload);
      }

      return {
        success: true,
        moveResult: result.moveResult,
      };
    },
  );

  socket.on("game:move", handleMove);

  // 2. game:resign
  const handleResign = createGameHandler<
    ResignRequest,
    { success: true }
  >(
    logger,
    "game:resign",
    socket,
    { schema: ResignRequestSchema, rateLimiter },
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.resign(roomCode, socket.id);
      timerRegistry.cancelAllForRoom(roomCode);
      io.to(roomCode).emit("game:over", result.gameOverPayload);
      return { success: true };
    },
  );

  socket.on("game:resign", handleResign);

  // 3. game:offer_draw
  const handleOfferDraw = createGameHandler<
    OfferDrawRequest,
    { success: true }
  >(
    logger,
    "game:offer_draw",
    socket,
    { schema: OfferDrawRequestSchema, rateLimiter },
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.offerDraw(roomCode, socket.id);
      if (result.opponentPlayer?.socketId) {
        io.to(result.opponentPlayer.socketId).emit("game:draw_offered", {
          fromPlayerId: result.fromPlayer.id,
          fromPlayerName: result.fromPlayer.name,
        });
      }
      return { success: true };
    },
  );

  socket.on("game:offer_draw", handleOfferDraw);

  // 4. game:respond_draw
  const handleRespondDraw = createGameHandler<
    RespondDrawRequest,
    { success: true }
  >(
    logger,
    "game:respond_draw",
    socket,
    { schema: RespondDrawRequestSchema, rateLimiter },
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.respondDraw(
        roomCode,
        socket.id,
        req.accept,
      );

      if (result.accept && result.gameOverPayload) {
        timerRegistry.cancelAllForRoom(roomCode);
        io.to(roomCode).emit("game:over", result.gameOverPayload);
      } else {
        io.to(roomCode).emit("game:draw_declined", {
          byPlayerId: result.byPlayerId,
        });
      }

      return { success: true };
    },
  );

  socket.on("game:respond_draw", handleRespondDraw);

  // 5. game:request_rematch
  const handleRequestRematch = createGameHandler<
    RequestRematchRequest,
    { success: true }
  >(
    logger,
    "game:request_rematch",
    socket,
    { schema: RequestRematchRequestSchema, rateLimiter },
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.requestRematch(roomCode, socket.id);

      io.to(roomCode).emit("game:rematch_requested", {
        requestedBy: result.requestedBy,
        requesterName: result.requesterName,
      });

      return { success: true };
    },
  );

  socket.on("game:request_rematch", handleRequestRematch);

  // 6. game:respond_rematch
  const handleRespondRematch = createGameHandler<
    RespondRematchRequest,
    { success: true }
  >(
    logger,
    "game:respond_rematch",
    socket,
    { schema: RespondRematchRequestSchema, rateLimiter },
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.respondRematch(
        roomCode,
        socket.id,
        req.accept,
      );

      if (result.accept && result.nextGameState) {
        io.to(roomCode).emit("game:rematch_started", {
          gameState: result.nextGameState,
          room: result.room,
        });
      } else {
        io.to(roomCode).emit("game:rematch_declined", {
          byPlayerId: result.byPlayerId,
        });
      }

      return { success: true };
    },
  );

  socket.on("game:respond_rematch", handleRespondRematch);
}
