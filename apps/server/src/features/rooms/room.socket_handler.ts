import { Socket } from "socket.io";
import { randomUUID } from "node:crypto";
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
  extractClientIp,
  createSocketRateLimiter,
} from "../../platform/socket/socket_rate_limiter.js";
import { RoomService } from "./room.service.js";
import { TypedSocketServer } from "../../platform/socket/socket_server.js";

export const DISCONNECT_GRACE_PERIOD_MS = 60_000;

export { createSocketRateLimiter };

export const defaultSocketRateLimiter = createSocketRateLimiter();

/**
 * In-memory map of pending disconnect grace timers keyed by `${roomCode}:${playerId}`.
 */
const disconnectTimers = new Map<string, NodeJS.Timeout>();

function getDisconnectTimerKey(
  roomCode: string,
  playerId: string,
): string {
  return `${roomCode.toUpperCase()}:${playerId}`;
}

export function cancelDisconnectTimer(
  roomCode: string,
  playerId: string,
): boolean {
  const key = getDisconnectTimerKey(roomCode, playerId);
  const timer = disconnectTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(key);
    return true;
  }
  return false;
}

export function cancelAllDisconnectTimersForRoom(roomCode: string): void {
  const prefix = `${roomCode.toUpperCase()}:`;
  for (const [key, timer] of disconnectTimers.entries()) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer);
      disconnectTimers.delete(key);
    }
  }
}

export function clearAllDisconnectTimers(): void {
  for (const timer of disconnectTimers.values()) {
    clearTimeout(timer);
  }
  disconnectTimers.clear();
}

/**
 * Registers Room lifecycle Socket.io event listeners.
 */
export function registerRoomSocketHandlers(
  io: TypedSocketServer,
  socket: Socket,
  roomService: RoomService,
  logger: Logger,
  rateLimiter: SocketRateLimiter = defaultSocketRateLimiter,
): void {
  // 1. room:create
  const handleCreate = wrapSocketHandler<
    CreateRoomRequest,
    { success: true; room: RoomState; sessionToken: string }
  >(
    logger,
    "room:create",
    socket,
    CreateRoomRequestSchema as any,
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

  socket.on(
    "room:create",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      const clientIp = extractClientIp(socket);
      if (!rateLimiter.consume(clientIp)) {
        const errorPayload = {
          code: "ERR_RATE_LIMITED" as const,
          message:
            "Rate limit exceeded for room creation. Maximum 5 requests per 10 seconds allowed.",
          correlationId: randomUUID(),
        };
        if (typeof callback === "function") {
          callback({ success: false, error: errorPayload });
        } else {
          socket.emit("error", errorPayload);
        }
        return;
      }
      return handleCreate(rawReq, callback as any);
    },
  );

  // 2. room:join
  const handleJoin = wrapSocketHandler<
    JoinRoomRequest,
    { success: true; room: RoomState; player: Player; sessionToken: string }
  >(logger, "room:join", socket, JoinRoomRequestSchema as any, async (req) => {
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
  });

  socket.on("room:join", async (rawReq: unknown, callback?: (res: unknown) => void) => {
    const clientIp = extractClientIp(socket);
    if (!rateLimiter.consume(clientIp)) {
      const errorPayload = {
        code: "ERR_RATE_LIMITED" as const,
        message:
          "Rate limit exceeded for room joining. Maximum 5 requests per 10 seconds allowed.",
        correlationId: randomUUID(),
      };
      if (typeof callback === "function") {
        callback({ success: false, error: errorPayload });
      } else {
        socket.emit("error", errorPayload);
      }
      return;
    }
    return handleJoin(rawReq, callback as any);
  });

  // 3. room:reconnect
  const handleReconnect = wrapSocketHandler<
    ReconnectRequest,
    { success: true; room: RoomState; player: Player }
  >(logger, "room:reconnect", socket, ReconnectRequestSchema, async (req) => {
    const result = await roomService.reconnect(req, socket.id);
    const roomCode = result.room.roomCode;
    await socket.join(roomCode);

    // Cancel any pending disconnect timer for this reconnected player
    cancelDisconnectTimer(roomCode, result.player.id);

    socket.to(roomCode).emit("room:player_reconnected", {
      playerId: result.player.id,
      playerName: result.player.name,
    });

    return {
      success: true,
      room: result.room,
      player: result.player,
    };
  });

  socket.on(
    "room:reconnect",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      const clientIp = extractClientIp(socket);
      if (!rateLimiter.consume(clientIp)) {
        const errorPayload = {
          code: "ERR_RATE_LIMITED" as const,
          message:
            "Rate limit exceeded for room reconnection. Maximum 5 requests per 10 seconds allowed.",
          correlationId: randomUUID(),
        };
        if (typeof callback === "function") {
          callback({ success: false, error: errorPayload });
        } else {
          socket.emit("error", errorPayload);
        }
        return;
      }
      return handleReconnect(rawReq, callback as any);
    },
  );

  // 4. room:leave
  socket.on(
    "room:leave",
    wrapSocketHandler<LeaveRoomRequest, { success: true }>(
      logger,
      "room:leave",
      socket,
      LeaveRoomRequestSchema,
      async (req) => {
        const result = await roomService.leaveRoom(req.roomCode, socket.id);
        const roomCode = req.roomCode.toUpperCase();
        await socket.leave(roomCode);

        // Cancel disconnect timers for this player
        cancelDisconnectTimer(roomCode, result.player.id);

        if (result.gameOverPayload) {
          cancelAllDisconnectTimersForRoom(roomCode);
          io.to(roomCode).emit("game:over", result.gameOverPayload);
        } else if (result.shouldDelete) {
          cancelAllDisconnectTimersForRoom(roomCode);
        } else {
          socket.to(roomCode).emit("room:player_left", {
            playerId: result.player.id,
            playerName: result.player.name,
            reason: "player_left",
          });
        }

        return { success: true };
      },
    ),
  );
}

/**
 * Handles socket disconnection event across rooms.
 * Starts a 60-second grace timer if the player was in an active game.
 */
export async function handleSocketDisconnect(
  io: TypedSocketServer,
  socketId: string,
  roomService: RoomService,
  logger: Logger,
  gracePeriodMs = DISCONNECT_GRACE_PERIOD_MS,
  _rateLimiter?: SocketRateLimiter,
): Promise<void> {
  const result = await roomService.handleDisconnect(socketId);
  if (!result) return;

  const { room, player, wasActiveGame } = result;
  logger.info(`Player disconnected from room ${room.roomCode}`, {
    operation: "player_disconnected",
    roomCode: room.roomCode,
    playerId: player.id,
    playerName: player.name,
    wasActiveGame,
  });

  io.to(room.roomCode).emit("room:player_disconnected", {
    playerId: player.id,
    gracePeriodMs,
  });

  if (wasActiveGame) {
    // Clear any previous timer for this player/room
    cancelDisconnectTimer(room.roomCode, player.id);

    const timer = setTimeout(async () => {
      disconnectTimers.delete(getDisconnectTimerKey(room.roomCode, player.id));
      try {
        const forfeitResult = await roomService.handleAbandonmentForfeit(
          room.roomCode,
          player.id,
        );
        if (forfeitResult) {
          logger.info(
            `Game forfeited by abandonment in room ${room.roomCode}`,
            {
              operation: "game_abandoned",
              roomCode: room.roomCode,
              playerId: player.id,
              winner: forfeitResult.gameOverPayload.winner,
            },
          );
          io.to(room.roomCode).emit("game:over", forfeitResult.gameOverPayload);
        }
      } catch (err) {
        logger.error(
          `Error processing disconnect timeout for room ${room.roomCode}`,
          {
            operation: "abandonment_error",
            roomCode: room.roomCode,
            error:
              err instanceof Error ? { message: err.message } : { raw: err },
          },
        );
      }
    }, gracePeriodMs);

    timer.unref?.();
    disconnectTimers.set(
      getDisconnectTimerKey(room.roomCode, player.id),
      timer,
    );
  }
}
