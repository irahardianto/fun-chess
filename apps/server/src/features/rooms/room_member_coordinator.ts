import {
  AppError,
  type GameOverPayload,
  type JoinRoomRequest,
  type Player,
  type ReconnectRequest,
  type RoomState,
  type IClock,
  type IIdGenerator,
  normalizeRoomCode,
  validatePlayerName,
  serializeError,
  toErrorMessage,
} from "@fun-chess/shared";
import type { IRoomStore } from "./room.store.js";
import type { ISessionRegistry } from "./session_registry.js";
import { SystemClock, UuidGenerator } from "../../platform/time/index.js";
import {
  type Logger,
  defaultLogger,
} from "../../platform/logger/index.js";
import {
  type IDisconnectTimerRegistry,
  DisconnectTimerRegistry,
} from "./disconnect_timer_registry.js";
import {
  RoomNotFoundError,
  InvalidRoomCodeError,
  InvalidSessionError,
  PlayerNotInRoomError,
  InvalidPayloadError,
} from "./room.errors.js";
import { ROOM_CODE_LENGTH } from "./room_code_generator.js";
import {
  addPlayerToRoom,
  reconnectPlayerTransition,
  leaveRoomTransition,
} from "./room.logic.js";

/**
 * Contract for managing room membership operations: player join, reconnection,
 * voluntary leaving, and socket updates under store locks.
 */
export interface IRoomMemberCoordinator {
  joinRoom(
    req: JoinRoomRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string; wasReconnected?: boolean }>;

  reconnect(
    req: ReconnectRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }>;

  leaveRoom(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState | null; player: Player; shouldDelete: boolean; gameOverPayload?: GameOverPayload }>;

  updatePlayerSocket(
    roomCode: string,
    playerId: string,
    newSocketId: string,
    correlationId?: string,
  ): Promise<RoomState>;
}

/**
 * Coordinates player joining, reconnection, leaving, and socket updating under locks
 * with structured logging and session registry integration.
 */
export class RoomMemberCoordinator implements IRoomMemberCoordinator {
  private readonly clock: IClock;
  private readonly timerRegistry: IDisconnectTimerRegistry;
  private readonly logger: Logger;
  private readonly idGenerator: IIdGenerator;

  constructor(
    private readonly store: IRoomStore,
    private readonly sessionRegistry: ISessionRegistry,
    clock?: IClock,
    timerRegistry?: IDisconnectTimerRegistry,
    logger?: Logger,
    idGenerator?: IIdGenerator,
  ) {
    this.clock = clock ?? new SystemClock();
    this.timerRegistry = timerRegistry ?? new DisconnectTimerRegistry();
    this.logger = logger ?? defaultLogger;
    this.idGenerator = idGenerator ?? new UuidGenerator();
  }

  /**
   * Helper to log service failures with 4xx demotion to warn (MAJ-012).
   */
  private logServiceFailure(
    operation: string,
    actionName: string,
    startTime: number,
    correlationId: string | undefined,
    err: unknown,
    metadata?: Record<string, unknown>,
  ): void {
    const duration = this.clock.now() - startTime;
    const isClientError = err instanceof AppError && err.statusCode < 500;
    const logContext = {
      operation,
      duration,
      durationMs: duration,
      error: serializeError(err),
      ...(metadata ?? {}),
      ...(correlationId ? { correlationId } : {}),
    };
    if (isClientError) {
      this.logger.warn(`${actionName} rejected`, logContext);
    } else {
      this.logger.error(`${actionName} failed`, logContext);
    }
  }

  /**
   * Joins an existing room by 4-letter room code.
   */
  public async joinRoom(
    req: JoinRoomRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{
    room: RoomState;
    player: Player;
    sessionToken: string;
    wasReconnected?: boolean;
  }> {
    const startTime = this.clock.now();
    const normalizedCode = normalizeRoomCode(req.roomCode || "");
    let rawName: string | undefined;

    try {
      if (!normalizedCode || normalizedCode.length !== ROOM_CODE_LENGTH) {
        throw new InvalidRoomCodeError(req.roomCode || "");
      }

      try {
        rawName = validatePlayerName(req.playerName);
      } catch (err) {
        throw new InvalidPayloadError(
          "playerName",
          toErrorMessage(err),
        );
      }

      this.logger.info("Joining room", {
        operation: "room_join",
        roomCode: normalizedCode,
        playerName: rawName,
        ...(correlationId ? { correlationId } : {}),
      });

      const playerId = this.idGenerator.generateId();
      const now = this.clock.now();

      const playerCandidate: Player = {
        id: playerId,
        socketId,
        name: rawName,
        avatar: req.avatar || "🦁",
        color: "b", // assigned by addPlayerToRoom
        isHost: false,
        isConnected: true,
        connectedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const result = await this.store.mutate(
        normalizedCode,
        async (room) => {
          const { nextRoom, assignedColor } = addPlayerToRoom(
            room,
            playerCandidate,
            false,
            this.clock.now(),
          );

          const assignedPlayer =
            assignedColor === "w" ? nextRoom.whitePlayer! : nextRoom.blackPlayer!;

          return {
            updatedRoom: nextRoom,
            result: {
              room: nextRoom,
              player: assignedPlayer,
              assignedColor: assignedColor!,
            },
          };
        },
        correlationId,
      );

      const sessionRecord = await this.sessionRegistry.createSession(
        {
          playerId,
          roomCode: normalizedCode,
          color: result.assignedColor,
          isHost: false,
          socketId,
        },
        { correlationId },
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Room joined", {
        operation: "room_join",
        roomCode: normalizedCode,
        playerId: result.player.id,
        role: "player",
        duration,
        durationMs: duration,
        ...(correlationId ? { correlationId } : {}),
      });

      return {
        room: result.room,
        player: result.player,
        sessionToken: sessionRecord.sessionToken,
        wasReconnected: false,
      };
    } catch (err) {
      this.logServiceFailure(
        "room_join",
        "Room join",
        startTime,
        correlationId,
        err,
        {
          roomCode: normalizedCode,
          playerName: rawName,
        },
      );
      throw err;
    }
  }

  /**
   * Restores a dropped player session after network glitch or page refresh.
   */
  public async reconnect(
    req: ReconnectRequest,
    socketId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; player: Player; sessionToken: string }> {
    const startTime = this.clock.now();

    if (!req.roomCode || req.roomCode.trim().length === 0) {
      throw new InvalidPayloadError("roomCode", "Room code cannot be empty");
    }
    if (!req.playerId || req.playerId.trim().length === 0) {
      throw new InvalidPayloadError("playerId", "Player ID cannot be empty");
    }
    if (!req.sessionToken || req.sessionToken.trim().length === 0) {
      throw new InvalidPayloadError(
        "sessionToken",
        "Session token cannot be empty",
      );
    }

    const normalizedCode = normalizeRoomCode(req.roomCode);
    if (normalizedCode.length !== ROOM_CODE_LENGTH) {
      throw new InvalidRoomCodeError(req.roomCode);
    }

    this.logger.info("Reconnecting player", {
      operation: "room_reconnect",
      roomCode: normalizedCode,
      playerId: req.playerId,
      ...(correlationId ? { correlationId } : {}),
    });

    try {
      const existing = await this.store.findByCode(normalizedCode);
      if (!existing) {
        throw new RoomNotFoundError(normalizedCode);
      }

      const session = await this.sessionRegistry.validateSession(
        req.sessionToken,
        normalizedCode,
        req.playerId,
        { signal: undefined },
      );
      if (!session) {
        throw new InvalidSessionError("Invalid session token");
      }

      const result = await this.store.mutate(
        normalizedCode,
        async (room) => {
          // Cancel disconnect timer under room lock (MAJ-028)
          this.timerRegistry.cancel(normalizedCode, req.playerId);

          const { nextRoom, player } = reconnectPlayerTransition(
            room,
            req.playerId,
            socketId,
            this.clock.now(),
          );

          return {
            updatedRoom: nextRoom,
            result: { room: nextRoom, player },
          };
        },
        correlationId,
      );

      await this.sessionRegistry.touchSession(
        req.sessionToken,
        socketId,
        undefined,
        { correlationId },
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Player reconnected", {
        operation: "room_reconnect",
        roomCode: normalizedCode,
        playerId: req.playerId,
        duration,
        durationMs: duration,
        ...(correlationId ? { correlationId } : {}),
      });

      return {
        ...result,
        sessionToken: session.sessionToken,
      };
    } catch (err) {
      this.logServiceFailure(
        "room_reconnect",
        "Player reconnect",
        startTime,
        correlationId,
        err,
        {
          roomCode: normalizedCode,
          playerId: req.playerId,
        },
      );
      throw err;
    }
  }

  /**
   * Removes or updates a player when they intentionally leave a room.
   */
  public async leaveRoom(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    player: Player;
    shouldDelete: boolean;
    gameOverPayload?: GameOverPayload;
  }> {
    const startTime = this.clock.now();
    const normalizedCode = normalizeRoomCode(roomCode);

    this.logger.info("Leaving room", {
      operation: "room_leave",
      roomCode: normalizedCode,
      socketId,
      ...(correlationId ? { correlationId } : {}),
    });

    try {
      const result = await this.store.withLock(
        normalizedCode,
        async () => {
          const room = await this.store.findByCode(normalizedCode);
          if (!room) {
            throw new RoomNotFoundError(normalizedCode);
          }

          let leavingPlayer: Player | null = null;
          if (room.whitePlayer?.socketId === socketId) {
            leavingPlayer = room.whitePlayer;
          } else if (room.blackPlayer?.socketId === socketId) {
            leavingPlayer = room.blackPlayer;
          } else {
            leavingPlayer =
              room.spectators.find((s) => s.socketId === socketId) ?? null;
          }

          if (!leavingPlayer && sessionToken) {
            const session = await this.sessionRegistry.getSessionByToken(
              sessionToken,
              { correlationId },
            );
            if (session && session.roomCode === normalizedCode) {
              if (room.whitePlayer?.id === session.playerId) {
                leavingPlayer = room.whitePlayer;
              } else if (room.blackPlayer?.id === session.playerId) {
                leavingPlayer = room.blackPlayer;
              } else {
                leavingPlayer =
                  room.spectators.find((s) => s.id === session.playerId) ?? null;
              }
            }
          }

          if (!leavingPlayer) {
            throw new PlayerNotInRoomError(socketId);
          }

          // Cancel disconnect timer for leaving player under room lock (MAJ-028)
          this.timerRegistry.cancel(normalizedCode, leavingPlayer.id);

          const now = this.clock.now();
          const { nextRoom, shouldDelete, gameOverPayload } = leaveRoomTransition(
            room,
            leavingPlayer.id,
            now,
          );

          if (shouldDelete || gameOverPayload) {
            this.timerRegistry.cancelAllForRoom(normalizedCode);
          }

          if (shouldDelete) {
            await this.store.delete(normalizedCode, { correlationId });
            await this.sessionRegistry.deleteSessionsForRoom(normalizedCode, {
              correlationId,
            });
          } else {
            await this.store.save(nextRoom, undefined, { correlationId });
            await this.sessionRegistry.deleteSessionForPlayer(
              normalizedCode,
              leavingPlayer.id,
              { correlationId },
            );
          }

          return {
            room: nextRoom,
            player: leavingPlayer,
            shouldDelete,
            gameOverPayload,
          };
        },
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Room left", {
        operation: "room_leave",
        roomCode: normalizedCode,
        playerId: result.player.id,
        shouldDelete: result.shouldDelete,
        duration,
        durationMs: duration,
        ...(correlationId ? { correlationId } : {}),
      });

      return result;
    } catch (err) {
      this.logServiceFailure(
        "room_leave",
        "Room leave",
        startTime,
        correlationId,
        err,
        {
          roomCode: normalizedCode,
        },
      );
      throw err;
    }
  }

  /**
   * Updates a player's socket ID in the room state under lock (MAJ-007 socket auto-healing).
   */
  public async updatePlayerSocket(
    roomCode: string,
    playerId: string,
    newSocketId: string,
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);
    this.logger.debug("Updating player socket", {
      operation: "room_update_player_socket",
      roomCode: code,
      playerId,
      ...(correlationId ? { correlationId } : {}),
    });
    return this.store.mutate(
      code,
      async (room) => {
        let whitePlayer = room.whitePlayer;
        let blackPlayer = room.blackPlayer;
        let spectators = room.spectators;
        let found = false;

        if (whitePlayer?.id === playerId) {
          whitePlayer = { ...whitePlayer, socketId: newSocketId, isConnected: true };
          found = true;
        } else if (blackPlayer?.id === playerId) {
          blackPlayer = { ...blackPlayer, socketId: newSocketId, isConnected: true };
          found = true;
        } else if (spectators.some((s) => s.id === playerId)) {
          spectators = spectators.map((s) =>
            s.id === playerId ? { ...s, socketId: newSocketId, isConnected: true } : s,
          );
          found = true;
        }

        if (!found) {
          throw new PlayerNotInRoomError(playerId);
        }

        const now = this.clock.now();
        const updatedRoom: RoomState = {
          ...room,
          whitePlayer,
          blackPlayer,
          spectators,
          lastActivityAt: now,
        };

        return { updatedRoom, result: updatedRoom };
      },
      correlationId,
    );
  }
}
