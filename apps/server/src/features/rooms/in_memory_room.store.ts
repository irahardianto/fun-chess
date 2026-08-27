import { RoomState } from "@fun-chess/shared";
import { RoomStore } from "./room.store.js";

/**
 * Production in-memory adapter for ephemeral RoomStore storage.
 * Guarantees immutability via deep cloning on storage and retrieval.
 */
export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, RoomState>();

  public async save(room: RoomState): Promise<void> {
    const code = room.roomCode.toUpperCase();
    this.rooms.set(code, structuredClone(room));
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
    return this.rooms.delete(code);
  }

  public async listActiveRooms(): Promise<RoomState[]> {
    return Array.from(this.rooms.values()).map((r) => structuredClone(r));
  }

  public async count(): Promise<number> {
    return this.rooms.size;
  }

  /**
   * Helper to clear store in tests or maintenance.
   */
  public async clear(): Promise<void> {
    this.rooms.clear();
  }
}
