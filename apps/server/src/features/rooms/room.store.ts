import { RoomState } from "@fun-chess/shared";

/**
 * Storage boundary abstraction for room persistence.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 */
export interface RoomStore {
  save(room: RoomState): Promise<void>;
  findByCode(roomCode: string): Promise<RoomState | null>;
  findBySocketId(
    socketId: string,
  ): Promise<{ room: RoomState; playerId: string } | null>;
  delete(roomCode: string): Promise<boolean>;
  listActiveRooms(): Promise<RoomState[]>;
  count(): Promise<number>;
}
