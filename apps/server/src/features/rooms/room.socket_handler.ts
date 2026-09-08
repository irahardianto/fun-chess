import { Socket } from "socket.io";
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
  Player,
  GameOverPayload,
} from "@fun-chess/shared";
import { type Logger, runLoggedJob } from "../../platform/logger/index.js";
import {
  type SocketRateLimiter,
  createSocketRateLimiter,
  type TypedSocketServer,
  type SocketOperationContext,
} from "../../platform/socket/index.js";
import {
  createFeatureSocketHandler,
  type FeatureSocketHandlerOptions,
} from "../common/socket_handler.utils.js";
import { RoomService } from "./room.service.js";
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

export const defaultSocketRateLimiter = createSocketRateLimiter();

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
  return async (rawReq: unknown, callback?: (res: unknown) => void): Promise<void> => {
    return inner(
      rawReq,
      callback
        ? (res: any) => {
            if (res?.error?.code === "ERR_RATE_LIMITED") {
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
              res.error.message = `Rate limit exceeded for ${opDesc}. ${limitDesc}`;
            }
            callback(res);
          }
        : undefined,
    );
  };
}

/**
 * Registers Room lifecycle Socket.io event listeners.
 */
export function registerRoomSocketHandlers(
  io: TypedSocketServer,
  socket: Socket,
  roomService: IRoomService,
  logger: Logger,
  rateLimiter: SocketRateLimiter = defaultSocketRateLimiter,
  timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): void {
  // 1. room:create
  const handleCreate = createRoomHandler<
    CreateRoomRequest,
    { success: true; room: RoomState; sessionToken: string }
  >(
    logger,
    "room:create",
    socket,
    { schema: CreateRoomRequestSchema as any, rateLimiter },
    async (req) => {
      const result = await roomService.createRoom(req, socket.id);
      await socket.join(result.room.roomCode);

      socket.emit("room:created", result.room);
      return {
        success: true,
        room: result.room,
        sessionToken: result.sessionToken,
      };
    },
  );

  socket.on("room:create", handleCreate);

  // 2. room:join
  const handleJoin = createRoomHandler<
    JoinRoomRequest,
    { success: true; room: RoomState; player: Player; sessionToken: string }
  >(
    logger,
    "room:join",
    socket,
    { schema: JoinRoomRequestSchema as any, rateLimiter },
    async (req) => {
      const result = await roomService.joinRoom(req, socket.id);
      const roomCode = result.room.roomCode;
      await socket.join(roomCode);

      socket.emit("room:joined", result.room);
      socket.to(roomCode).emit("room:player_joined", {
        player: result.player,
        room: result.room,
      });

      if (result.room.status === "playing") {
        io.to(roomCode).emit("game:started", result.room.game);
      }

      return {
        success: true,
        room: result.room,
        player: result.player,
        sessionToken: result.sessionToken,
      };
    },
  );

  socket.on("room:join", handleJoin);

  // 3. room:reconnect
  const handleReconnect = createRoomHandler<
    ReconnectRequest,
    { success: true; room: RoomState; player: Player; roomStatus?: string }
  >(
    logger,
    "room:reconnect",
    socket,
    { schema: ReconnectRequestSchema, rateLimiter },
    async (req) => {
      const result = await roomService.reconnect(req, socket.id);
      const roomCode = result.room.roomCode;
      await socket.join(roomCode);

      // Cancel any pending disconnect timer for this reconnected player
      timerRegistry.cancel(roomCode, result.player.id);

      socket.to(roomCode).emit("room:player_reconnected", {
        playerId: result.player.id,
        playerName: result.player.name,
        roomStatus: result.room.status,
      });

      socket.emit("room:reconnected", {
        room: result.room,
        player: result.player,
        roomStatus: result.room.status,
      });

      return {
        success: true,
        room: result.room,
        player: result.player,
        roomStatus: result.room.status,
      };
    },
  );

  socket.on("room:reconnect", handleReconnect);

  // 4. room:leave
  const handleLeave = createRoomHandler<
    LeaveRoomRequest,
    { success: true }
  >(
    logger,
    "room:leave",
    socket,
    { schema: LeaveRoomRequestSchema, rateLimiter },
    async (req) => {
      const result = await roomService.leaveRoom(req.roomCode, socket.id);
      const roomCode = req.roomCode.toUpperCase();
      await socket.leave(roomCode);

      // Cancel disconnect timers for this player
      timerRegistry.cancel(roomCode, result.player.id);

      if (result.gameOverPayload) {
        timerRegistry.cancelAllForRoom(roomCode);
        io.to(roomCode).emit("game:over", result.gameOverPayload);
      } else if (result.shouldDelete) {
        timerRegistry.cancelAllForRoom(roomCode);
      } else {
        socket.to(roomCode).emit("room:player_left", {
          playerId: result.player.id,
          playerName: result.player.name,
          reason: "player_left",
        });
      }

      return { success: true };
    },
  );

  socket.on("room:leave", handleLeave);
}

/**
 * Handles socket disconnection event across rooms.
 * Starts a grace timer under the room lock if the player was in an active game.
 * Uses standardized 3-point logged job for disconnect abandonment (MAJ-023).
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
  const onForfeit = async (room: RoomState, gameOverPayload: GameOverPayload) => {
    try {
      await runLoggedJob(
        logger,
        "disconnect_grace_period_abandonment",
        async (jobCorrelationId) => {
          logger.info("Game forfeited by abandonment", {
            operation: "game_abandoned",
            correlationId: jobCorrelationId,
            roomCode: room.roomCode,
            playerId: gameOverPayload.winner,
            winner: gameOverPayload.winner,
          });
          io.to(room.roomCode).emit("game:over", gameOverPayload);
          return {
            roomCode: room.roomCode,
            forfeited: true,
          };
        },
      );
    } catch {
      // Handled by runLoggedJob
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
  logger.info("Player disconnected from room", {
    operation: "player_disconnected",
    ...(correlationId ? { correlationId } : {}),
    roomCode: room.roomCode,
    playerId: player.id,
    playerName: player.name,
    wasActiveGame,
  });

  io.to(room.roomCode).emit("room:player_disconnected", {
    playerId: player.id,
    gracePeriodMs,
    roomStatus: room.status,
  });
}
