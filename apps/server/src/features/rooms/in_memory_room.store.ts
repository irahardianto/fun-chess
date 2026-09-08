import { RoomState } from "@fun-chess/shared";
import { RoomStore, RoomMutator } from "./room.store.js";
import {
  RoomNotFoundError,
  OptimisticLockConflictError,
  LockTimeoutError,
  LockExecutionTimeoutError,
} from "./room.errors.js";
import {
  IClock,
  SystemClock,
  IIdGenerator,
  UuidGenerator,
} from "./clock.js";

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
  // PERF: Reverse index from roomCode -> Set<socketId> for O(k) cleanup instead of O(N) scan
  private readonly roomSockets = new Map<string, Set<string>>();
  public readonly LOCK_TIMEOUT_MS = 5000;
  public readonly EXECUTION_TIMEOUT_MS = 5000;

  constructor(
    private readonly clock: IClock = new SystemClock(),
    private readonly idGenerator: IIdGenerator = new UuidGenerator(),
  ) {}

  private indexSockets(room: RoomState): void {
    const code = room.roomCode.toUpperCase();
    this.unindexSockets(code);

    const sockets = new Set<string>();
    if (room.whitePlayer?.socketId) {
      this.socketIndex.set(room.whitePlayer.socketId, { roomCode: code, playerId: room.whitePlayer.id });
      sockets.add(room.whitePlayer.socketId);
    }
    if (room.blackPlayer?.socketId) {
      this.socketIndex.set(room.blackPlayer.socketId, { roomCode: code, playerId: room.blackPlayer.id });
      sockets.add(room.blackPlayer.socketId);
    }
    if (room.spectators) {
      for (const s of room.spectators) {
        if (s.socketId) {
          this.socketIndex.set(s.socketId, { roomCode: code, playerId: s.id });
          sockets.add(s.socketId);
        }
      }
    }
    if (sockets.size > 0) {
      this.roomSockets.set(code, sockets);
    }
  }

  private unindexSockets(roomCode: string): void {
    const code = roomCode.toUpperCase();
    const sockets = this.roomSockets.get(code);
    if (sockets) {
      for (const socketId of sockets) {
        this.socketIndex.delete(socketId);
      }
      this.roomSockets.delete(code);
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
      const sockets = this.roomSockets.get(indexed.roomCode);
      if (sockets) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.roomSockets.delete(indexed.roomCode);
        }
      }
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

    let acquireTimer: NodeJS.Timeout | undefined;
    let executionTimer: NodeJS.Timeout | undefined;
    let acquired = false;
    try {
      // 1. Lock Acquisition Race (5000ms acquisition timeout)
      await Promise.race([
        prevTail,
        new Promise((_, reject) => {
          acquireTimer = setTimeout(
            () => reject(new LockTimeoutError(code, this.LOCK_TIMEOUT_MS)),
            this.LOCK_TIMEOUT_MS,
          );
        }),
      ]);
      acquired = true;
      if (acquireTimer) clearTimeout(acquireTimer);

      // 2. Lock Execution Race (5000ms execution timeout) — MAJ-005
      const actionPromise = action();
      const executionTimeoutPromise = new Promise<never>((_, reject) => {
        executionTimer = setTimeout(
          () => reject(new LockExecutionTimeoutError(code, this.EXECUTION_TIMEOUT_MS)),
          this.EXECUTION_TIMEOUT_MS,
        );
      });

      return await Promise.race([actionPromise, executionTimeoutPromise]);
    } finally {
      if (acquireTimer) clearTimeout(acquireTimer);
      if (executionTimer) clearTimeout(executionTimer);
      if (acquired) {
        releaseLock();
        const currentEntry = this.lockQueues.get(code);
        if (currentEntry) {
          currentEntry.waitersCount--;
          if (currentEntry.waitersCount <= 0) {
            // Prevent memory leak: purge drained queue
            this.lockQueues.delete(code);
          }
        }
      } else {
        // CRIT-002: On timeout before acquisition, do NOT prematurely release the lock
        // or delete the queue from lockQueues.
        // Forward resolution once prevTail settles so queued waiters remain blocked until the slow holder completes.
        prevTail.finally(() => {
          releaseLock();
          const currentEntry = this.lockQueues.get(code);
          if (currentEntry) {
            currentEntry.waitersCount--;
            if (currentEntry.waitersCount <= 0) {
              this.lockQueues.delete(code);
            }
          }
        });
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
        lastActivityAt:
          updatedRoom.lastActivityAt !== existing.lastActivityAt
            ? updatedRoom.lastActivityAt
            : this.clock.now(),
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
      lastActivityAt: room.lastActivityAt ?? this.clock.now(),
    };

    this.rooms.set(code, roomToSave);
    this.indexSockets(roomToSave);
  }

  public async delete(roomCode: string): Promise<boolean> {
    const code = roomCode.toUpperCase();
    const entry = this.lockQueues.get(code);
    if (entry && entry.waitersCount > 0) {
      // Retain queue until all queued operations settle to preserve linearizability (MAJ-024)
      entry.tail.finally(() => {
        const current = this.lockQueues.get(code);
        if (current && current.waitersCount <= 0) {
          this.lockQueues.delete(code);
        }
      });
    } else {
      this.lockQueues.delete(code);
    }
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
    this.roomSockets.clear();
    this.rooms.clear();
  }
}
