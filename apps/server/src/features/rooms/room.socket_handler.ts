import { randomUUID } from "node:crypto";
import { Socket } from "socket.io";
import { z } from "zod";
import {
  CreateRoomRequest,
  CreateRoomRequestSchema,
  JoinRoomRequest,
  JoinRoomRequestSchema,
  LeaveRoomRequest,
  LeaveRoomRequestSchema,
  ReconnectRequest,
  ReconnectRequestSchema,
  RoomState,
  RoomStatus,
  Player,
  GameOverPayload,
  normalizeRoomCode,
  validatePlayerName,
} from "@fun-chess/shared";
import { type Logger } from "../../platform/logger/index.js";
import {
  type SocketRateLimiter,
  createSocketRateLimiter,
  type TypedSocketServer,
  type SocketOperationContext,
  createFeatureSocketHandler,
  type FeatureSocketHandlerOptions,
} from "../../platform/socket/index.js";
import type { IRoomService } from "./room.interface.js";
import {
  type IDisconnectTimerRegistry,
  DisconnectTimerRegistry,
  defaultDisconnectTimerRegistry,
  cancelDisconnectTimer,
  cancelAllDisconnectTimersForRoom,
  clearAllDisconnectTimers,
  DISCONNECT_GRACE_PERIOD_MS,
} from "./disconnect_timer_registry.js";
import { sanitizePublicRoom, sanitizePublicPlayer } from "./room.logic.js";

export {
  createSocketRateLimiter,
  type IDisconnectTimerRegistry,
  DisconnectTimerRegistry,
  defaultDisconnectTimerRegistry,
  cancelDisconnectTimer,
  cancelAllDisconnectTimersForRoom,
  clearAllDisconnectTimers,
  DISCONNECT_GRACE_PERIOD_MS,
};

function createRoomHandler<TReq, TRes>(
  logger: Logger,
  operationName: string,
  socket: Socket,
  options: FeatureSocketHandlerOptions<TReq>,
  handler: (req: TReq, context: SocketOperationContext) => Promise<TRes>,
) {
  const inner = createFeatureSocketHandler<TReq, TRes>(
    logger,
    operationName,
    socket,
    options,
    handler,
  );
  return async (
    rawReq: unknown,
    callback?: (res: unknown) => void,
  ): Promise<void> => {
    return inner(
      rawReq,
      callback
        ? (res: unknown) => {
            if (
              typeof res === "object" &&
              res !== null &&
              "error" in res &&
              typeof (res as { error?: { code?: string } }).error ===
                "object" &&
              (res as { error?: { code?: string } }).error?.code ===
                "ERR_RATE_LIMITED"
            ) {
              const limitDesc = options.rateLimiter.getLimitDescription();
              const opDesc =
                operationName === "room:create"
                  ? "room creation"
                  : operationName === "room:join"
                    ? "room joining"
                    : operationName === "room:reconnect"
                      ? "room reconnection"
                      : operationName === "room:leave"
                        ? "room leave"
                        : operationName;
              (
                res as { error: { code: string; message: string } }
              ).error.message =
                `Rate limit exceeded for ${opDesc}. ${limitDesc}`;
            }
            callback(res);
          }
        : undefined,
    );
  };
}

/**
 * Safely executes socket.join(roomCode) wrapped in try/catch to isolate transport errors (ENH-005).
 */
async function safeSocketJoin(
  socket: Socket | { id: string; join: (room: string) => Promise<void> | void },
  roomCode: string,
  logger: Logger,
): Promise<void> {
  try {
    await socket.join(roomCode);
  } catch (err) {
    logger.warn("Failed to join socket room", {
      operation: "socket_room_membership_error",
      roomCode,
      socketId: socket.id,
      action: "join",
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { raw: err },
    });
  }
}

/**
 * Safely executes socket.leave(roomCode) wrapped in try/catch to isolate transport errors (ENH-005).
 */
async function safeSocketLeave(
  socket: Socket | { id: string; leave: (room: string) => Promise<void> | void },
  roomCode: string,
  logger: Logger,
): Promise<void> {
  try {
    await socket.leave(roomCode);
  } catch (err) {
    logger.warn("Failed to leave socket room", {
      operation: "socket_room_membership_error",
      roomCode,
      socketId: socket.id,
      action: "leave",
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { raw: err },
    });
  }
}

/**
 * Registers Room lifecycle Socket.io event listeners.
 */
export function registerRoomSocketHandlers(
  io: TypedSocketServer,
  socket: Socket,
  roomService: IRoomService,
  logger: Logger,
  rateLimiter: SocketRateLimiter,
  timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
  createRateLimiter: SocketRateLimiter = rateLimiter,
  trustProxy: boolean = false,
): void {
  const effectiveTrustProxy =
    (socket.data as { trustProxy?: boolean } | undefined)?.trustProxy ??
    trustProxy;

  // 1. room:create - differential rate limit (MAJ-006, MAJ-008 dual-delivery elimination)
  const handleCreate = createRoomHandler<
    CreateRoomRequest,
    { success: true; room: RoomState; player: Player; sessionToken: string }
  >(
    logger,
    "room:create",
    socket,
    {
      schema: CreateRoomRequestSchema as z.ZodType<CreateRoomRequest>,
      rateLimiter: createRateLimiter,
      trustProxy: effectiveTrustProxy,
    },
    async (req) => {
      validatePlayerName(req.playerName);
      const result = await roomService.createRoom(req, socket.id);
      if (socket.data) {
        socket.data.userId = result.player.id;
        socket.data.roomCode = result.room.roomCode;
        socket.data.sessionToken = result.sessionToken;
      }
      await safeSocketJoin(socket, result.room.roomCode, logger);

      // MAJ-008: Dual delivery eliminated. State is delivered exclusively via ack callback.
      return {
        success: true,
        room: sanitizePublicRoom(result.room),
        player: sanitizePublicPlayer(result.player),
        sessionToken: result.sessionToken,
      };
    },
  );

  socket.on("room:create", handleCreate);

  // 2. room:join (MAJ-008 dual-delivery elimination, MAJ-009)
  const handleJoin = createRoomHandler<
    JoinRoomRequest,
    { success: true; room: RoomState; player: Player; sessionToken: string }
  >(
    logger,
    "room:join",
    socket,
    {
      schema: JoinRoomRequestSchema as z.ZodType<JoinRoomRequest>,
      rateLimiter,
      trustProxy: effectiveTrustProxy,
    },
    async (req) => {
      validatePlayerName(req.playerName);
      const normalizedCode = normalizeRoomCode(req.roomCode);
      const result = await roomService.joinRoom(
        { ...req, roomCode: normalizedCode },
        socket.id,
      );
      if (socket.data) {
        socket.data.userId = result.player.id;
        socket.data.roomCode = result.room.roomCode;
        socket.data.sessionToken = result.sessionToken;
      }
      const roomCode = result.room.roomCode;
      await safeSocketJoin(socket, roomCode, logger);

      // MAJ-008: Dual delivery eliminated. Emit room:player_joined strictly to peer sockets.
      socket.to(roomCode).emit("room:player_joined", {
        player: sanitizePublicPlayer(result.player),
        room: sanitizePublicRoom(result.room),
      });

      if (result.room.status === "playing") {
        io.to(roomCode).emit("game:started", result.room.game);
      }

      return {
        success: true,
        room: sanitizePublicRoom(result.room),
        player: sanitizePublicPlayer(result.player),
        sessionToken: result.sessionToken,
      };
    },
  );

  socket.on("room:join", handleJoin);

  // 3. room:reconnect (MAJ-008: RoomStatus ack type narrowing, MAJ-009, ENH-005, ENH-015)
  const handleReconnect = createRoomHandler<
    ReconnectRequest,
    {
      success: true;
      room: RoomState;
      player: Player;
      roomStatus: RoomStatus;
      sessionToken: string;
    }
  >(
    logger,
    "room:reconnect",
    socket,
    {
      schema: ReconnectRequestSchema as z.ZodType<ReconnectRequest>,
      rateLimiter,
      trustProxy: effectiveTrustProxy,
    },
    async (req) => {
      const normalizedCode = normalizeRoomCode(req.roomCode);
      const result = await roomService.reconnect(
        { ...req, roomCode: normalizedCode },
        socket.id,
      );
      if (socket.data) {
        socket.data.userId = result.player.id;
        socket.data.roomCode = result.room.roomCode;
        socket.data.sessionToken = result.sessionToken ?? req.sessionToken;
      }
      const roomCode = result.room.roomCode;
      await safeSocketJoin(socket, roomCode, logger);

      // Cancel any pending disconnect timer for this reconnected player
      timerRegistry.cancel(roomCode, result.player.id);

      socket.to(roomCode).emit("room:player_reconnected", {
        playerId: result.player.id,
        playerName: result.player.name,
        roomStatus: result.room.status,
      });

      socket.emit("room:reconnected", {
        room: sanitizePublicRoom(result.room),
        player: sanitizePublicPlayer(result.player),
        roomStatus: result.room.status,
      });

      return {
        success: true,
        room: sanitizePublicRoom(result.room),
        player: sanitizePublicPlayer(result.player),
        roomStatus: result.room.status,
        sessionToken: result.sessionToken ?? req.sessionToken,
      };
    },
  );

  socket.on("room:reconnect", handleReconnect);

  // 4. room:leave (MAJ-009, ENH-005)
  const handleLeave = createRoomHandler<LeaveRoomRequest, { success: true }>(
    logger,
    "room:leave",
    socket,
    {
      schema: LeaveRoomRequestSchema as z.ZodType<LeaveRoomRequest>,
      rateLimiter,
      trustProxy: effectiveTrustProxy,
    },
    async (req) => {
      const roomCode = normalizeRoomCode(req.roomCode);
      const result = await roomService.leaveRoom(roomCode, socket.id);

      // Cancel disconnect timers for this player
      timerRegistry.cancel(roomCode, result.player.id);

      if (result.shouldDelete) {
        socket.to(roomCode).emit("room:player_left", {
          playerId: result.player.id,
          playerName: result.player.name,
          reason: result.player.isHost ? "host_left" : "player_left",
        });
        timerRegistry.cancelAllForRoom(roomCode);
        if (typeof io.in === "function") {
          try {
            const socketsInRoom = await io.in(roomCode).fetchSockets();
            for (const s of socketsInRoom) {
              await safeSocketLeave(s, roomCode, logger);
            }
          } catch (err) {
            logger.warn("Failed to fetch sockets on room deletion", {
              operation: "socket_room_membership_error",
              roomCode,
              action: "fetch_and_leave",
              error:
                err instanceof Error
                  ? { name: err.name, message: err.message, stack: err.stack }
                  : { raw: err },
            });
          }
        }
      } else if (result.gameOverPayload) {
        timerRegistry.cancelAllForRoom(roomCode);
        io.to(roomCode).emit("game:over", result.gameOverPayload);
      } else {
        socket.to(roomCode).emit("room:player_left", {
          playerId: result.player.id,
          playerName: result.player.name,
          reason: "player_left",
        });
      }

      await safeSocketLeave(socket, roomCode, logger);
      return { success: true };
    },
  );

  socket.on("room:leave", handleLeave);
}

/**
 * Handles socket disconnection event across rooms.
 * Starts a grace timer under the room lock if the player was in an active game.
 * Uses standardized 3-point logged job for disconnect abandonment (MAJ-023).
 * Remediated with correlationId default randomUUID(), duration logging, and clean payload (MIN-010, MIN-011).
 */
export async function handleSocketDisconnect(
  io: TypedSocketServer,
  socketId: string,
  roomService: IRoomService,
  logger: Logger,
  gracePeriodMs = DISCONNECT_GRACE_PERIOD_MS,
  _rateLimiter?: SocketRateLimiter,
  timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
  correlationId?: string,
): Promise<void> {
  const activeCorrelationId = correlationId ?? randomUUID();
  const startTime = Date.now();

  const onForfeit = async (
    room: RoomState,
    gameOverPayload: GameOverPayload,
    jobCorrelationId?: string,
    forfeitedPlayerId?: string,
  ) => {
    const activeJobCorrelationId = jobCorrelationId ?? activeCorrelationId;
    const disconnectedPlayerId =
      forfeitedPlayerId ??
      (gameOverPayload.winner === "w"
        ? room.blackPlayer?.id
        : gameOverPayload.winner === "b"
          ? room.whitePlayer?.id
          : undefined);

    try {
      // MIN-011: rename playerId field to winnerColor and emit disconnectedPlayerId
      logger.info("Game forfeited by abandonment", {
        operation: "game_abandoned",
        correlationId: activeJobCorrelationId,
        roomCode: room.roomCode,
        winnerColor: gameOverPayload.winner,
        disconnectedPlayerId,
        winner: gameOverPayload.winner,
      });
      io.to(room.roomCode).emit("game:over", gameOverPayload);
    } catch (err) {
      logger.error("Failed to process disconnect grace period abandonment", {
        operation: "disconnect_grace_period_abandonment",
        roomCode: room.roomCode,
        correlationId: activeJobCorrelationId,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
      throw err;
    }
  };

  const result = await roomService.handleDisconnect(
    socketId,
    onForfeit,
    gracePeriodMs,
    timerRegistry,
  );
  if (!result) return;

  const { room, player, wasActiveGame } = result;
  const duration = Date.now() - startTime;

  // MIN-010: ensure correlationId and duration / durationMs are logged
  logger.info("Player disconnected from room", {
    operation: "player_disconnected",
    correlationId: activeCorrelationId,
    roomCode: room.roomCode,
    playerId: player.id,
    playerName: player.name,
    wasActiveGame,
    duration,
    durationMs: duration,
  });

  // MAJ-008 / api_contracts.md §2.1: Align emission to { playerId, gracePeriodMs, roomStatus }
  io.to(room.roomCode).emit("room:player_disconnected", {
    playerId: player.id,
    gracePeriodMs,
    roomStatus: room.status,
  });
}
