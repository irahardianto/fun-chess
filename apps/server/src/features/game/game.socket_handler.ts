import { Socket } from "socket.io";
import { randomUUID } from "node:crypto";
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
  extractClientIp,
  createSocketRateLimiter,
} from "../../platform/socket/socket_rate_limiter.js";
import { GameService } from "./game.service.js";
import { TypedSocketServer } from "../../platform/socket/socket_server.js";
import {
  IDisconnectTimerRegistry,
  defaultDisconnectTimerRegistry,
  cancelAllDisconnectTimersForRoom,
} from "../rooms/index.js";

function checkGameRateLimit(
  socket: Socket,
  rateLimiter: SocketRateLimiter,
  logger: Logger,
  operation: string,
  message: string,
  callback?: (res: unknown) => void,
): boolean {
  const clientIp = extractClientIp(socket);
  if (!rateLimiter.check(clientIp)) {
    const correlationId = randomUUID();
    const errorPayload = {
      code: "ERR_RATE_LIMITED" as const,
      message,
      correlationId,
    };
    logger.warn(`Rate limit exceeded for ${operation}`, {
      operation,
      correlationId,
      socketId: socket.id,
      clientIp,
      error: { code: "ERR_RATE_LIMITED", message },
    });
    if (typeof callback === "function") {
      callback({ success: false, error: errorPayload });
    } else {
      socket.emit("error", errorPayload);
    }
    return false;
  }
  return true;
}

/**
 * Registers gameplay Socket.io event listeners.
 */
export function registerGameSocketHandlers(
  io: TypedSocketServer,
  socket: Socket,
  gameService: GameService,
  logger: Logger,
  rateLimiter: SocketRateLimiter = createSocketRateLimiter(),
  timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): void {
  // 1. game:move
  const handleMove = wrapSocketHandler<
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

  socket.on(
    "game:move",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      if (
        !checkGameRateLimit(
          socket,
          rateLimiter,
          logger,
          "game:move",
          "Rate limit exceeded for game moves. Maximum 5 requests per 10 seconds allowed.",
          callback,
        )
      ) {
        return;
      }
      return handleMove(rawReq, callback as any);
    },
  );

  // 2. game:resign
  const handleResign = wrapSocketHandler<
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

  socket.on(
    "game:resign",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      if (
        !checkGameRateLimit(
          socket,
          rateLimiter,
          logger,
          "game:resign",
          "Rate limit exceeded for game resignation. Maximum 5 requests per 10 seconds allowed.",
          callback,
        )
      ) {
        return;
      }
      return handleResign(rawReq, callback as any);
    },
  );

  // 3. game:offer_draw
  const handleOfferDraw = wrapSocketHandler<
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

  socket.on(
    "game:offer_draw",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      if (
        !checkGameRateLimit(
          socket,
          rateLimiter,
          logger,
          "game:offer_draw",
          "Rate limit exceeded for draw offers. Maximum 5 requests per 10 seconds allowed.",
          callback,
        )
      ) {
        return;
      }
      return handleOfferDraw(rawReq, callback as any);
    },
  );

  // 4. game:respond_draw
  const handleRespondDraw = wrapSocketHandler<
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

  socket.on(
    "game:respond_draw",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      if (
        !checkGameRateLimit(
          socket,
          rateLimiter,
          logger,
          "game:respond_draw",
          "Rate limit exceeded for draw responses. Maximum 5 requests per 10 seconds allowed.",
          callback,
        )
      ) {
        return;
      }
      return handleRespondDraw(rawReq, callback as any);
    },
  );

  // 5. game:request_rematch
  const handleRequestRematch = wrapSocketHandler<
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

  socket.on(
    "game:request_rematch",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      if (
        !checkGameRateLimit(
          socket,
          rateLimiter,
          logger,
          "game:request_rematch",
          "Rate limit exceeded for rematch requests. Maximum 5 requests per 10 seconds allowed.",
          callback,
        )
      ) {
        return;
      }
      return handleRequestRematch(rawReq, callback as any);
    },
  );

  // 6. game:respond_rematch
  const handleRespondRematch = wrapSocketHandler<
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

  socket.on(
    "game:respond_rematch",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      if (
        !checkGameRateLimit(
          socket,
          rateLimiter,
          logger,
          "game:respond_rematch",
          "Rate limit exceeded for rematch responses. Maximum 5 requests per 10 seconds allowed.",
          callback,
        )
      ) {
        return;
      }
      return handleRespondRematch(rawReq, callback as any);
    },
  );
}
