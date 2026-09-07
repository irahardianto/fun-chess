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
import { runLoggedJob } from "../../platform/logger/job_runner.js";

export const DISCONNECT_GRACE_PERIOD_MS = 60_000;

export { createSocketRateLimiter };

export const defaultSocketRateLimiter = createSocketRateLimiter();

export interface IDisconnectTimerRegistry {
  set(roomCode: string, playerId: string, timer: NodeJS.Timeout): void;
  get(roomCode: string, playerId: string): NodeJS.Timeout | undefined;
  cancel(roomCode: string, playerId: string): boolean;
  cancelAllForRoom(roomCode: string): void;
  clear(): void;
  size(): number;
}

/**
 * In-memory registry of pending disconnect grace timers keyed by `${roomCode}:${playerId}`.
 * Encapsulates mutable timer state (MIN-007) and enables test isolation.
 */
export class DisconnectTimerRegistry implements IDisconnectTimerRegistry {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private getKey(roomCode: string, playerId: string): string {
    return `${roomCode.toUpperCase()}:${playerId}`;
  }

  public set(roomCode: string, playerId: string, timer: NodeJS.Timeout): void {
    const key = this.getKey(roomCode, playerId);
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(key, timer);
  }

  public get(roomCode: string, playerId: string): NodeJS.Timeout | undefined {
    return this.timers.get(this.getKey(roomCode, playerId));
  }

  public cancel(roomCode: string, playerId: string): boolean {
    const key = this.getKey(roomCode, playerId);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
      return true;
    }
    return false;
  }

  public cancelAllForRoom(roomCode: string): void {
    const prefix = `${roomCode.toUpperCase()}:`;
    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    }
  }

  public clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  public size(): number {
    return this.timers.size;
  }
}

export const defaultDisconnectTimerRegistry = new DisconnectTimerRegistry();

export function cancelDisconnectTimer(
  roomCode: string,
  playerId: string,
  registry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): boolean {
  return registry.cancel(roomCode, playerId);
}

export function cancelAllDisconnectTimersForRoom(
  roomCode: string,
  registry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): void {
  registry.cancelAllForRoom(roomCode);
}

export function clearAllDisconnectTimers(
  registry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): void {
  registry.clear();
}

function checkRoomRateLimit(
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
 * Registers Room lifecycle Socket.io event listeners.
 */
export function registerRoomSocketHandlers(
  io: TypedSocketServer,
  socket: Socket,
  roomService: RoomService,
  logger: Logger,
  rateLimiter: SocketRateLimiter = defaultSocketRateLimiter,
  timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
): void {
  // 1. room:create
  const handleCreate = wrapSocketHandler<
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
  const handleJoin = wrapSocketHandler<
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

  socket.on("room:join", async (rawReq: unknown, callback?: (res: unknown) => void) => {
    if (
      !checkRoomRateLimit(
        socket,
        rateLimiter,
        logger,
        "room:join",
        "Rate limit exceeded for room joining. Maximum 5 requests per 10 seconds allowed.",
        callback,
      )
    ) {
      return;
    }
    return handleJoin(rawReq, callback as any);
  });

  // 3. room:reconnect
  const handleReconnect = wrapSocketHandler<
    ReconnectRequest,
    { success: true; room: RoomState; player: Player }
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
      });

      return {
        success: true,
        room: result.room,
        player: result.player,
      };
    },
  );

  socket.on(
    "room:reconnect",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      if (
        !checkRoomRateLimit(
          socket,
          rateLimiter,
          logger,
          "room:reconnect",
          "Rate limit exceeded for room reconnection. Maximum 5 requests per 10 seconds allowed.",
          callback,
        )
      ) {
        return;
      }
      return handleReconnect(rawReq, callback as any);
    },
  );

  // 4. room:leave
  const handleLeave = wrapSocketHandler<LeaveRoomRequest, { success: true }>(
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

  socket.on(
    "room:leave",
    async (rawReq: unknown, callback?: (res: unknown) => void) => {
      if (
        !checkRoomRateLimit(
          socket,
          rateLimiter,
          logger,
          "room:leave",
          "Rate limit exceeded for room leave. Maximum 5 requests per 10 seconds allowed.",
          callback,
        )
      ) {
        return;
      }
      return handleLeave(rawReq, callback as any);
    },
  );
}

/**
 * Handles socket disconnection event across rooms.
 * Starts a 60-second grace timer if the player was in an active game.
 * Uses standardized 3-point logged job for disconnect abandonment (MAJ-023).
 */
export async function handleSocketDisconnect(
  io: TypedSocketServer,
  socketId: string,
  roomService: RoomService,
  logger: Logger,
  gracePeriodMs = DISCONNECT_GRACE_PERIOD_MS,
  _rateLimiter?: SocketRateLimiter,
  timerRegistry: IDisconnectTimerRegistry = defaultDisconnectTimerRegistry,
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
