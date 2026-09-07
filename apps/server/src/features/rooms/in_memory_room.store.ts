import { RoomState } from "@fun-chess/shared";
import { RoomStore, RoomMutator } from "./room.store.js";
import {
  RoomNotFoundError,
  OptimisticLockConflictError,
  LockTimeoutError,
} from "./room.errors.js";

interface LockEntry {
  tail: Promise<unknown>;
  waitersCount: number;
}

/**
 * Production in-memory adapter for ephemeral RoomStore storage.
 * Enforces linearizable per-room mutations via FIFO lock queues and monotonic CAS versioning (CRIT-006).
 */
export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, RoomState>();
  private readonly lockQueues = new Map<string, LockEntry>();
  // PERF: Reverse index from socketId -> { roomCode, playerId } for O(1) disconnect lookups (HIGH-006)
  private readonly socketIndex = new Map<string, { roomCode: string; playerId: string }>();
  private readonly LOCK_TIMEOUT_MS = 5000;

  private indexSockets(room: RoomState): void {
    const code = room.roomCode.toUpperCase();
    if (room.whitePlayer?.socketId) {
      this.socketIndex.set(room.whitePlayer.socketId, { roomCode: code, playerId: room.whitePlayer.id });
    }
    if (room.blackPlayer?.socketId) {
      this.socketIndex.set(room.blackPlayer.socketId, { roomCode: code, playerId: room.blackPlayer.id });
    }
    if (room.spectators) {
      for (const s of room.spectators) {
        if (s.socketId) {
          this.socketIndex.set(s.socketId, { roomCode: code, playerId: s.id });
        }
      }
    }
  }

  private unindexSockets(roomCode: string): void {
    const code = roomCode.toUpperCase();
    for (const [socketId, entry] of this.socketIndex.entries()) {
      if (entry.roomCode === code) {
        this.socketIndex.delete(socketId);
      }
    }
  }

  public async findByCode(roomCode: string): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    return room ? structuredClone(room) : null;
  }

  public async findBySocketId(
    socketId: string,
  ): Promise<{ room: RoomState; playerId: string } | null> {
    // PERF: O(1) map lookup
    const indexed = this.socketIndex.get(socketId);
    if (indexed) {
      const room = this.rooms.get(indexed.roomCode);
      if (room) {
        if (
          room.whitePlayer?.socketId === socketId ||
          room.blackPlayer?.socketId === socketId ||
          room.spectators?.some((s) => s.socketId === socketId)
        ) {
          return { room: structuredClone(room), playerId: indexed.playerId };
        }
      }
      this.socketIndex.delete(socketId);
    }

    // Fallback scan across active rooms
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

  public async withLock<T>(
    roomCode: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const code = roomCode.toUpperCase();
    let entry = this.lockQueues.get(code);

    if (!entry) {
      entry = { tail: Promise.resolve(), waitersCount: 0 };
      this.lockQueues.set(code, entry);
    }

    entry.waitersCount++;
    const prevTail = entry.tail;

    let releaseLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    entry.tail = prevTail.then(
      () => currentLock,
      () => currentLock,
    );

    let timer: NodeJS.Timeout | undefined;
    try {
      // PERF: Cancel timeout timer once lock acquired to prevent event loop timer leaks (HIGH-001)
      await Promise.race([
        prevTail,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new LockTimeoutError(code, this.LOCK_TIMEOUT_MS)),
            this.LOCK_TIMEOUT_MS,
          );
        }),
      ]);
      if (timer) clearTimeout(timer);

      return await action();
    } finally {
      if (timer) clearTimeout(timer);
      releaseLock();
      const currentEntry = this.lockQueues.get(code);
      if (currentEntry) {
        currentEntry.waitersCount--;
        if (currentEntry.waitersCount <= 0) {
          // Prevent memory leak: purge drained queue
          this.lockQueues.delete(code);
        }
      }
    }
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

      // Increment version and persist
      const nextVersion = expectedVersion + 1;
      const roomToSave: RoomState = {
        ...structuredClone(updatedRoom),
        version: nextVersion,
        lastActivityAt: updatedRoom.lastActivityAt ?? Date.now(),
      };

      this.rooms.set(code, roomToSave);
      this.indexSockets(roomToSave);
      return result;
    });
  }

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

    this.rooms.set(code, roomToSave);
    this.indexSockets(roomToSave);
  }

  public async delete(roomCode: string): Promise<boolean> {
    const code = roomCode.toUpperCase();
    this.lockQueues.delete(code);
    this.unindexSockets(code);
    return this.rooms.delete(code);
  }

  public async listActiveRooms(): Promise<RoomState[]> {
    return Array.from(this.rooms.values()).map((r) => structuredClone(r));
  }

  public async count(): Promise<number> {
    return this.rooms.size;
  }

  /**
   * Helper to clear store and active queues in tests or maintenance.
   */
  public async clear(): Promise<void> {
    this.lockQueues.clear();
    this.socketIndex.clear();
    this.rooms.clear();
  }
}
