import { Socket } from "socket.io";
import {
  CreateRoomRequest,
  JoinRoomRequest,
  LeaveRoomRequest,
  ReconnectRequest,
  RoomState,
  Player,
} from "@fun-chess/shared";
import { Logger } from "../../platform/logger/logger.interface.js";
import { wrapSocketHandler } from "../../platform/socket/socket_logging_middleware.js";
import { RoomService } from "./room.service.js";
import { TypedSocketServer } from "../../platform/socket/socket_server.js";

export const DISCONNECT_GRACE_PERIOD_MS = 60_000;

/**
 * In-memory map of pending disconnect grace timers keyed by `${roomCode}:${playerId}`.
 */
export const disconnectTimers = new Map<string, NodeJS.Timeout>();

export function getDisconnectTimerKey(
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
): void {
  // 1. room:create
  socket.on(
    "room:create",
    wrapSocketHandler<
      CreateRoomRequest,
      { success: true; room: RoomState; sessionToken: string }
    >(logger, "room:create", socket.id, async (req) => {
      const result = await roomService.createRoom(req, socket.id);
      await socket.join(result.room.roomCode);

      socket.emit("room:created", result.room);
      return {
        success: true,
        room: result.room,
        sessionToken: result.sessionToken,
      };
    }),
  );

  // 2. room:join
  socket.on(
    "room:join",
    wrapSocketHandler<
      JoinRoomRequest,
      { success: true; room: RoomState; player: Player; sessionToken: string }
    >(logger, "room:join", socket.id, async (req) => {
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
    }),
  );

  // 3. room:reconnect
  socket.on(
    "room:reconnect",
    wrapSocketHandler<
      ReconnectRequest,
      { success: true; room: RoomState; player: Player }
    >(logger, "room:reconnect", socket.id, async (req) => {
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
    }),
  );

  // 4. room:leave
  socket.on(
    "room:leave",
    wrapSocketHandler<LeaveRoomRequest, { success: true }>(
      logger,
      "room:leave",
      socket.id,
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
