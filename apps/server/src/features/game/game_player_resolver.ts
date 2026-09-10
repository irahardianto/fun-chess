import {
  type Player,
  type RoomState,
  PlayerNotInRoomError,
  serializeError,
} from "@fun-chess/shared";
import type {
  IRoomGameAdapter,
  ISessionRegistry,
  SessionRecord,
} from "../rooms/index.js";
import { type Logger, defaultLogger } from "../../platform/logger/index.js";

/**
 * Interface contract for resolving and authenticating players within rooms.
 */
export interface IGamePlayerResolver {
  resolveAuthenticatedPlayer(
    room: RoomState,
    socketId: string,
    sessionToken?: string,
    correlationId?: string,
  ): Promise<{ player: Player; room: RoomState }>;
  getPlayerBySocketId(room: RoomState, socketId: string): Player | null;
}

/**
 * Handles player session lookup, token verification against ISessionRegistry,
 * and socket auto-healing via roomAdapter.updatePlayerSocket (MAJ-007).
 */
export class GamePlayerResolver implements IGamePlayerResolver {
  constructor(
    private readonly roomAdapter: IRoomGameAdapter,
    private readonly sessionRegistry?: ISessionRegistry,
    private readonly logger: Logger = defaultLogger,
  ) {}

  /**
   * Resolves the player from the given room using session token authentication or socket ID fallback.
   * If session token is valid but the player's socket has changed (e.g. after network reconnection),
   * auto-heals the socket ID in the room store and session registry (MAJ-007).
   */
  public async resolveAuthenticatedPlayer(
    room: RoomState,
    socketId: string,
    sessionToken?: string,
    correlationId?: string,
  ): Promise<{ player: Player; room: RoomState }> {
    if (sessionToken && this.sessionRegistry) {
      try {
        let session: SessionRecord | null = null;
        if (typeof this.sessionRegistry.getSessionByToken === "function") {
          session = await this.sessionRegistry.getSessionByToken(
            sessionToken,
            correlationId ? { correlationId } : undefined,
          );
        }
        if (
          session &&
          session.roomCode.toUpperCase() === room.roomCode.toUpperCase()
        ) {
          const playerId = session.playerId;
          let player =
            room.whitePlayer?.id === playerId
              ? room.whitePlayer
              : room.blackPlayer?.id === playerId
                ? room.blackPlayer
                : null;
          if (player) {
            let currentRoom = room;
            if (player.socketId !== socketId) {
              const oldSocketId = player.socketId;
              currentRoom = await this.roomAdapter.updatePlayerSocket(
                room.roomCode,
                playerId,
                socketId,
                correlationId,
              );
              player =
                currentRoom.whitePlayer?.id === playerId
                  ? currentRoom.whitePlayer
                  : currentRoom.blackPlayer?.id === playerId
                    ? currentRoom.blackPlayer
                    : player;
              await this.sessionRegistry.touchSession(
                sessionToken,
                socketId,
                undefined,
                correlationId ? { correlationId } : undefined,
              );
              this.logger.info("Player socket auto-healed", {
                operation: "player_socket_auto_healed",
                roomCode: room.roomCode,
                playerId,
                oldSocketId,
                newSocketId: socketId,
                ...(correlationId ? { correlationId } : {}),
              });
            }
            return { player, room: currentRoom };
          }
        }
      } catch (err) {
        this.logger.warn("Session validation failed during player resolution", {
          operation: "session_validation_fallback",
          roomCode: room.roomCode,
          socketId,
          error: serializeError(err),
          ...(correlationId ? { correlationId } : {}),
        });
      }
    }

    const player = this.getPlayerBySocketId(room, socketId);
    if (!player) {
      throw new PlayerNotInRoomError(socketId);
    }
    return { player, room };
  }

  /**
   * Retrieves player from room by active socket ID.
   */
  public getPlayerBySocketId(room: RoomState, socketId: string): Player | null {
    if (room.whitePlayer?.socketId === socketId) return room.whitePlayer;
    if (room.blackPlayer?.socketId === socketId) return room.blackPlayer;
    return null;
  }
}
