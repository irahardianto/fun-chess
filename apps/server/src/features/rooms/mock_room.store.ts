import {
  GameState,
  GameOverPayload,
  Player,
  RoomState,
} from "@fun-chess/shared";
import { RoomStore, RoomMutator } from "./room.store.js";
import {
  RoomNotFoundError,
  OptimisticLockConflictError,
  RoomAlreadyExistsError,
} from "./room.errors.js";
import {
  applyGameMoveTransition,
  finalizeGameTransition,
  updateDrawOfferTransition,
  updateRematchTransition,
} from "./room.logic.js";

/**
 * Unit test double for RoomStore.
 * Provides inspectable spy arrays for verifying storage interactions.
 */
export class MockRoomStore implements RoomStore {
  public rooms: Map<string, RoomState> = new Map();
  public saveCalls: RoomState[] = [];
  public deleteCalls: string[] = [];

  public async save(room: RoomState, expectedVersion?: number): Promise<void> {
    const code = room.roomCode.toUpperCase();
    const existing = this.rooms.get(code);

    if (existing && expectedVersion !== undefined) {
      const currentVer = existing.version || 1;
      if (currentVer !== expectedVersion) {
        throw new OptimisticLockConflictError(
          code,
          expectedVersion,
          currentVer,
        );
      }
    }

    const nextVersion = existing ? (existing.version || 1) + 1 : (room.version || 1);
    const roomToSave: RoomState = {
      ...structuredClone(room),
      version: nextVersion,
      lastActivityAt: room.lastActivityAt ?? Date.now(),
    };

    this.saveCalls.push(structuredClone(roomToSave));
    this.rooms.set(code, roomToSave);
  }

  public async createIfAbsent(room: RoomState): Promise<void> {
    const code = room.roomCode.toUpperCase();
    await this.withLock(code, async () => {
      if (this.rooms.has(code)) {
        throw new RoomAlreadyExistsError(code);
      }
      const roomToSave: RoomState = {
        ...structuredClone(room),
        version: room.version || 1,
        lastActivityAt: room.lastActivityAt ?? Date.now(),
      };
      this.saveCalls.push(structuredClone(roomToSave));
      this.rooms.set(code, roomToSave);
    });
  }

  public async mutate<T>(
    roomCode: string,
    mutator: RoomMutator<T>,
  ): Promise<T> {
    return this.withLock(roomCode, async () => {
      const code = roomCode.toUpperCase();
      const existing = this.rooms.get(code);
      if (!existing) {
        throw new RoomNotFoundError(code);
      }

      const clone = structuredClone(existing);
      const expectedVersion = clone.version || 1;

      const { updatedRoom, result } = await mutator(clone);

      if (updatedRoom.roomCode.toUpperCase() !== code) {
        throw new Error(
          `Mutation cannot alter roomCode: expected ${code}, received ${updatedRoom.roomCode}`,
        );
      }

      const nextVersion = expectedVersion + 1;
      const roomToSave: RoomState = {
        ...structuredClone(updatedRoom),
        version: nextVersion,
        lastActivityAt: updatedRoom.lastActivityAt ?? Date.now(),
      };

      this.saveCalls.push(structuredClone(roomToSave));
      this.rooms.set(code, roomToSave);
      return result;
    });
  }

  public async withLock<T>(
    _roomCode: string,
    action: () => Promise<T>,
  ): Promise<T> {
    return await action();
  }

  public async findByCode(roomCode: string): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    return room ? structuredClone(room) : null;
  }

  public async findBySocketId(
    socketId: string,
  ): Promise<{ room: RoomState; playerId: string } | null> {
    for (const room of this.rooms.values()) {
      if (room.whitePlayer?.socketId === socketId) {
        return { room: structuredClone(room), playerId: room.whitePlayer.id };
      }
      if (room.blackPlayer?.socketId === socketId) {
        return { room: structuredClone(room), playerId: room.blackPlayer.id };
      }
      const spectator = room.spectators?.find((s) => s.socketId === socketId);
      if (spectator) {
        return { room: structuredClone(room), playerId: spectator.id };
      }
    }
    return null;
  }

  public async delete(roomCode: string): Promise<boolean> {
    const code = roomCode.toUpperCase();
    this.deleteCalls.push(code);
    return this.rooms.delete(code);
  }

  public async listActiveRooms(): Promise<RoomState[]> {
    return Array.from(this.rooms.values()).map((r) => structuredClone(r));
  }

  public async count(): Promise<number> {
    return this.rooms.size;
  }

  public async clear(): Promise<void> {
    this.rooms.clear();
    this.saveCalls = [];
    this.deleteCalls = [];
  }

  // --- IRoomGameAdapter Implementation ---

  public async getRoom(roomCode: string): Promise<RoomState | null> {
    return this.findByCode(roomCode);
  }

  public async applyGameMove(
    roomCode: string,
    nextGameState: GameState,
    gameOverPayload?: GameOverPayload,
  ): Promise<RoomState> {
    return this.mutate(roomCode, (room) => {
      const now = Date.now();
      const updated = applyGameMoveTransition(
        room,
        nextGameState,
        gameOverPayload,
        now,
      );
      return { updatedRoom: updated, result: updated };
    });
  }

  public async finalizeGame(
    roomCode: string,
    gameOverPayload: GameOverPayload,
  ): Promise<RoomState> {
    return this.mutate(roomCode, (room) => {
      const now = Date.now();
      const updated = finalizeGameTransition(room, gameOverPayload, now);
      return { updatedRoom: updated, result: updated };
    });
  }

  public async updateDrawOffer(
    roomCode: string,
    drawOffer: RoomState["drawOffer"],
  ): Promise<RoomState> {
    return this.mutate(roomCode, (room) => {
      const now = Date.now();
      const updated = updateDrawOfferTransition(room, drawOffer, now);
      return { updatedRoom: updated, result: updated };
    });
  }

  public async updateRematch(
    roomCode: string,
    rematch: RoomState["rematch"],
    newGameState?: GameState,
    players?: { whitePlayer: Player | null; blackPlayer: Player | null },
  ): Promise<RoomState> {
    return this.mutate(roomCode, (room) => {
      const now = Date.now();
      const updated = updateRematchTransition(
        room,
        rematch,
        newGameState,
        now,
        players,
      );
      return { updatedRoom: updated, result: updated };
    });
  }
}
