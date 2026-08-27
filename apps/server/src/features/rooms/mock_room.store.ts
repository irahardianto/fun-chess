import { RoomState } from "@fun-chess/shared";
import { RoomStore } from "./room.store.js";

/**
 * Unit test double for RoomStore.
 * Provides inspectable spy arrays for verifying storage interactions.
 */
export class MockRoomStore implements RoomStore {
  public rooms: Map<string, RoomState> = new Map();
  public saveCalls: RoomState[] = [];
  public deleteCalls: string[] = [];

  public async save(room: RoomState): Promise<void> {
    const code = room.roomCode.toUpperCase();
    this.saveCalls.push(structuredClone(room));
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
    this.deleteCalls.push(code);
    return this.rooms.delete(code);
  }

  public async listActiveRooms(): Promise<RoomState[]> {
    return Array.from(this.rooms.values()).map((r) => structuredClone(r));
  }

  public async count(): Promise<number> {
    return this.rooms.size;
  }

  public clear(): void {
    this.rooms.clear();
    this.saveCalls = [];
    this.deleteCalls = [];
  }
}
