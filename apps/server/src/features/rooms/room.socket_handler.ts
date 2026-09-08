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
} from "@fun-chess/shared";
import { Logger } from "../../platform/logger/logger.interface.js";
import { wrapSocketHandler } from "../../platform/socket/socket_logging_middleware.js";
import {
  SocketRateLimiter,
  createSocketRateLimiter,
} from "../../platform/socket/socket_rate_limiter.js";
import { RoomService } from "./room.service.js";
import type { IRoomService } from "./room.interface.js";
import { TypedSocketServer } from "../../platform/socket/socket_server.js";
import { runLoggedJob } from "../../platform/logger/job_runner.js";
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
    const limitDesc =
      (options.rateLimiter as any)?.getLimitDescription?.() ||
      "Maximum 60 requests per 10 seconds allowed.";
    switch (op) {
      case "room:create":
        return `Rate limit exceeded for room creation. ${limitDesc}`;
      case "room:join":
        return `Rate limit exceeded for room joining. ${limitDesc}`;
      case "room:reconnect":
        return `Rate limit exceeded for room reconnection. ${limitDesc}`;
      case "room:leave":
        return `Rate limit exceeded for room leave. ${limitDesc}`;
      default:
        return `Rate limit exceeded for ${op}. ${limitDesc}`;
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
      } as any);

      socket.emit("room:reconnected" as any, {
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
  const handleLeave = createRoomHandler<LeaveRoomRequest, { success: true }>(
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
 * Starts a 60-second grace timer if the player was in an active game.
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
  const result = await roomService.handleDisconnect(socketId);
  if (!result) return;

  const { room, player, wasActiveGame } = result;
  logger.info(`Player disconnected from room ${room.roomCode}`, {
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
  } as any);

  if (wasActiveGame) {
    // Clear any previous timer for this player/room
    timerRegistry.cancel(room.roomCode, player.id);

    const timer = setTimeout(async () => {
      timerRegistry.cancel(room.roomCode, player.id);
      try {
        await runLoggedJob(
          logger,
          "disconnect_grace_period_abandonment",
          async (correlationId) => {
            const forfeitResult = await roomService.handleAbandonmentForfeit(
              room.roomCode,
              player.id,
            );
            if (forfeitResult) {
              logger.info(
                `Game forfeited by abandonment in room ${room.roomCode}`,
                {
                  operation: "game_abandoned",
                  correlationId,
                  roomCode: room.roomCode,
                  playerId: player.id,
                  winner: forfeitResult.gameOverPayload.winner,
                },
              );
              io.to(room.roomCode).emit("game:over", forfeitResult.gameOverPayload);
            }
            return {
              roomCode: room.roomCode,
              playerId: player.id,
              forfeited: !!forfeitResult,
            };
          },
        );
      } catch {
        // runLoggedJob logs error on failure; caught here to prevent unhandled rejection in setTimeout
      }
    }, gracePeriodMs);

    timer.unref?.();
    timerRegistry.set(room.roomCode, player.id, timer);
  }
}
