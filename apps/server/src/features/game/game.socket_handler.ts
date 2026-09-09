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
import { env } from "../../platform/config/index.js";
import type { Logger } from "../../platform/logger/index.js";
import {
  SocketRateLimiter,
  createSocketRateLimiter,
  TypedSocketServer,
} from "../../platform/socket/index.js";
import { createFeatureSocketHandler } from "../../platform/socket/socket_handler.utils.js";
import type { IGameService } from "./game.interface.js";
import {
  type IDisconnectTimerRegistry,
  defaultDisconnectTimerRegistry,
  type SessionRegistry,
} from "../rooms/index.js";

export const defaultSocketRateLimiter = createSocketRateLimiter();

/**
 * Registers gameplay Socket.io event listeners.
 */
export function registerGameSocketHandlers(
  io: TypedSocketServer,
  socket: Socket,
  gameService: IGameService,
  logger: Logger,
  rateLimiter: SocketRateLimiter = defaultSocketRateLimiter,
  timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
  sessionRegistry?: SessionRegistry,
  trustProxy: boolean = env.TRUST_PROXY,
): void {
  const effectiveTrustProxy =
    (socket.data as { trustProxy?: boolean } | undefined)?.trustProxy ??
    trustProxy;

  // 1. game:move
  const handleMove = createFeatureSocketHandler<
    MakeMoveRequest,
    { success: true; moveResult: MoveResult }
  >(
    logger,
    "game:move",
    socket,
    { schema: MakeMoveRequestSchema, rateLimiter, trustProxy: effectiveTrustProxy },
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.makeMove(req, socket.id);

      if (sessionRegistry) {
        const sessionToken = (socket.data as { sessionToken?: string } | undefined)?.sessionToken;
        if (sessionToken) {
          await sessionRegistry.touchSession(sessionToken, socket.id);
        } else {
          const playerId = (socket.data as { userId?: string } | undefined)?.userId;
          let token: string | null | undefined;
          if (playerId && typeof sessionRegistry.getSessionTokenForPlayer === "function") {
            token = await sessionRegistry.getSessionTokenForPlayer(roomCode, playerId);
          }
          if (!token && playerId) {
            token = (sessionRegistry as { playerIndex?: Map<string, string> }).playerIndex?.get(
              `${roomCode}:${playerId}`,
            );
          }
          if (token) {
            await sessionRegistry.touchSession(token, socket.id);
          }
        }
      }

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
  const handleResign = createFeatureSocketHandler<
    ResignRequest,
    { success: true }
  >(
    logger,
    "game:resign",
    socket,
    { schema: ResignRequestSchema, rateLimiter, trustProxy: effectiveTrustProxy },
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
  const handleOfferDraw = createFeatureSocketHandler<
    OfferDrawRequest,
    { success: true }
  >(
    logger,
    "game:offer_draw",
    socket,
    { schema: OfferDrawRequestSchema, rateLimiter, trustProxy: effectiveTrustProxy },
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
  const handleRespondDraw = createFeatureSocketHandler<
    RespondDrawRequest,
    { success: true }
  >(
    logger,
    "game:respond_draw",
    socket,
    { schema: RespondDrawRequestSchema, rateLimiter, trustProxy: effectiveTrustProxy },
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
  const handleRequestRematch = createFeatureSocketHandler<
    RequestRematchRequest,
    { success: true }
  >(
    logger,
    "game:request_rematch",
    socket,
    { schema: RequestRematchRequestSchema, rateLimiter, trustProxy: effectiveTrustProxy },
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
  const handleRespondRematch = createFeatureSocketHandler<
    RespondRematchRequest,
    { success: true }
  >(
    logger,
    "game:respond_rematch",
    socket,
    { schema: RespondRematchRequestSchema, rateLimiter, trustProxy: effectiveTrustProxy },
    async (req) => {
      const roomCode = req.roomCode.trim().toUpperCase();
      const result = await gameService.respondRematch(
        roomCode,
        socket.id,
        req.accept,
      );

      if (result.accept && result.nextGameState) {
        timerRegistry.cancelAllForRoom(roomCode);
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
