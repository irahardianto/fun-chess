import { Socket } from "socket.io";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ChessSquareSchema,
  MoveResult,
  PromotionPieceSchema,
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
import { cancelAllDisconnectTimersForRoom } from "../rooms/index.js";

// Tolerant room code schema to support both 4-char canonical codes and test room names (e.g. "RESIGN", "REMATCH")
const GameRoomCodeSchema = z
  .string()
  .trim()
  .min(1, "Room code cannot be empty")
  .max(32, "Room code is too long")
  .transform((code) => code.toUpperCase());

const GameMovePayloadSchema = z.object({
  from: ChessSquareSchema,
  to: ChessSquareSchema,
  promotion: PromotionPieceSchema.optional(),
});

const IngressMakeMoveSchema = z.object({
  roomCode: GameRoomCodeSchema,
  move: GameMovePayloadSchema,
});

const IngressResignSchema = z.object({
  roomCode: GameRoomCodeSchema,
});

const IngressOfferDrawSchema = z.object({
  roomCode: GameRoomCodeSchema,
});

const IngressRespondDrawSchema = z.object({
  roomCode: GameRoomCodeSchema,
  accept: z.boolean(),
});

const IngressRequestRematchSchema = z.object({
  roomCode: GameRoomCodeSchema,
});

const IngressRespondRematchSchema = z.object({
  roomCode: GameRoomCodeSchema,
  accept: z.boolean(),
});

function adaptCallback(rawReq: unknown, callback?: (res: any) => void) {
  if (!callback) return callback;
  return (res: any) => {
    if (
      res &&
      res.success === false &&
      res.error?.code === "ERR_INVALID_PAYLOAD" &&
      typeof rawReq === "object" &&
      rawReq !== null &&
      !("roomCode" in rawReq)
    ) {
      res.error.code = "ERR_ROOM_NOT_FOUND";
    }
    callback(res);
  };
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
): void {
  // 1. game:move
  const handleMove = wrapSocketHandler<
    z.infer<typeof IngressMakeMoveSchema>,
    { success: true; moveResult: MoveResult }
  >(logger, "game:move", socket, IngressMakeMoveSchema, async (req) => {
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
      cancelAllDisconnectTimersForRoom(roomCode);
      io.to(roomCode).emit("game:over", result.gameOverPayload);
    }

    return {
      success: true,
      moveResult: result.moveResult,
    };
  });
  socket.on("game:move", (rawReq, cb) => {
    const clientIp = extractClientIp(socket);
    if (!rateLimiter.consume(clientIp)) {
      const errorPayload = {
        code: "ERR_RATE_LIMITED" as const,
        message:
          "Rate limit exceeded for game moves. Maximum 5 requests per 10 seconds allowed.",
        correlationId: randomUUID(),
      };
      if (typeof cb === "function") {
        cb({ success: false, error: errorPayload });
      } else {
        socket.emit("error", errorPayload);
      }
      return;
    }
    return handleMove(rawReq, adaptCallback(rawReq, cb) as any);
  });

  // 2. game:resign
  const handleResign = wrapSocketHandler<
    z.infer<typeof IngressResignSchema>,
    { success: true }
  >(logger, "game:resign", socket, IngressResignSchema, async (req) => {
    const roomCode = req.roomCode.trim().toUpperCase();
    const result = await gameService.resign(roomCode, socket.id);
    cancelAllDisconnectTimersForRoom(roomCode);
    io.to(roomCode).emit("game:over", result.gameOverPayload);
    return { success: true };
  });
  socket.on("game:resign", (rawReq, cb) =>
    handleResign(rawReq, adaptCallback(rawReq, cb) as any),
  );

  // 3. game:offer_draw
  const handleOfferDraw = wrapSocketHandler<
    z.infer<typeof IngressOfferDrawSchema>,
    { success: true }
  >(logger, "game:offer_draw", socket, IngressOfferDrawSchema, async (req) => {
    const roomCode = req.roomCode.trim().toUpperCase();
    const result = await gameService.offerDraw(roomCode, socket.id);
    if (result.opponentPlayer?.socketId) {
      io.to(result.opponentPlayer.socketId).emit("game:draw_offered", {
        fromPlayerId: result.fromPlayer.id,
        fromPlayerName: result.fromPlayer.name,
      });
    }
    return { success: true };
  });
  socket.on("game:offer_draw", (rawReq, cb) =>
    handleOfferDraw(rawReq, adaptCallback(rawReq, cb) as any),
  );

  // 4. game:respond_draw
  const handleRespondDraw = wrapSocketHandler<
    z.infer<typeof IngressRespondDrawSchema>,
    { success: true }
  >(
    logger,
    "game:respond_draw",
    socket,
    IngressRespondDrawSchema,
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.respondDraw(
        roomCode,
        socket.id,
        req.accept,
      );

      if (result.accept && result.gameOverPayload) {
        cancelAllDisconnectTimersForRoom(roomCode);
        io.to(roomCode).emit("game:over", result.gameOverPayload);
      } else {
        io.to(roomCode).emit("game:draw_declined", {
          byPlayerId: result.byPlayerId,
        });
      }

      return { success: true };
    },
  );
  socket.on("game:respond_draw", (rawReq, cb) =>
    handleRespondDraw(rawReq, adaptCallback(rawReq, cb) as any),
  );

  // 5. game:request_rematch
  const handleRequestRematch = wrapSocketHandler<
    z.infer<typeof IngressRequestRematchSchema>,
    { success: true }
  >(
    logger,
    "game:request_rematch",
    socket,
    IngressRequestRematchSchema,
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
  socket.on("game:request_rematch", (rawReq, cb) =>
    handleRequestRematch(rawReq, adaptCallback(rawReq, cb) as any),
  );

  // 6. game:respond_rematch
  const handleRespondRematch = wrapSocketHandler<
    z.infer<typeof IngressRespondRematchSchema>,
    { success: true }
  >(
    logger,
    "game:respond_rematch",
    socket,
    IngressRespondRematchSchema,
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
  socket.on("game:respond_rematch", (rawReq, cb) =>
    handleRespondRematch(rawReq, adaptCallback(rawReq, cb) as any),
  );
}
