import { AsyncLocalStorage } from "node:async_hooks";
import type {
  RoomState,
  IClock,
  IIdGenerator,
} from "@fun-chess/shared";
import { RoomStore, RoomMutator } from "./room.store.js";
import {
  RoomNotFoundError,
  OptimisticLockConflictError,
  LockTimeoutError,
  LockExecutionTimeoutError,
  RoomAlreadyExistsError,
  StaleLockExecutionError,
  RoomCapacityExceededError,
} from "./room.errors.js";
import { SystemClock, UuidGenerator } from "../../platform/time/index.js";
import { type Logger, defaultLogger } from "../../platform/logger/index.js";

export const MAX_ROOMS = 10_000;

export interface LockContext {
  roomCode: string;
  ticket: number;
  isCancelled: () => boolean;
}

interface LockEntry {
  tail: Promise<unknown>;
  waitersCount: number;
}

/**
 * Production in-memory adapter for ephemeral RoomStore storage.
 * Enforces linearizable per-room mutations via FIFO lock queues, monotonic CAS versioning,
 * and a monotonic ticket sequence model with stale execution rejection (CRIT-002, CRIT-003, CRIT-006).
 */
export class InMemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, RoomState>();
  private readonly lockQueues = new Map<string, LockEntry>();
  // PERF: Reverse index from socketId -> { roomCode, playerId } for O(1) disconnect lookups (HIGH-006)
  private readonly socketIndex = new Map<string, { roomCode: string; playerId: string }>();
  // PERF: Reverse index from roomCode -> Set<socketId> for O(k) cleanup instead of O(N) scan
  private readonly roomSockets = new Map<string, Set<string>>();

  // Monotonic ticket model for lock acquisitions (CRIT-002)
  private ticketSequence = 0;
  private readonly activeTickets = new Map<string, number>();
  private readonly cancelledTickets = new Set<number>();
  private readonly lockContextStorage = new AsyncLocalStorage<LockContext>();

  public readonly MAX_CANCELLED_TICKETS = 5_000;

  private trackCancelledTicket(ticket: number): void {
    this.cancelledTickets.add(ticket);
    if (this.cancelledTickets.size > this.MAX_CANCELLED_TICKETS) {
      const oldest = this.cancelledTickets.values().next().value;
      if (oldest !== undefined) {
        this.cancelledTickets.delete(oldest);
      }
    }
  }

  public LOCK_TIMEOUT_MS = 5000;
  public EXECUTION_TIMEOUT_MS = 5000;
  public maxRooms: number = MAX_ROOMS;
  private readonly clock: IClock;
  private readonly idGenerator: IIdGenerator;
  private readonly logger: Logger;

  constructor(
    clockOrLogger?: IClock | Logger,
    idGenerator?: IIdGenerator,
    optionsOrLogger?:
      | Logger
      | {
          lockTimeoutMs?: number;
          executionTimeoutMs?: number;
          maxRooms?: number;
          logger?: Logger;
        },
    options?: {
      lockTimeoutMs?: number;
      executionTimeoutMs?: number;
      maxRooms?: number;
      logger?: Logger;
    },
  ) {
    let resolvedLogger: Logger | undefined;
    if (
      clockOrLogger &&
      "info" in clockOrLogger &&
      typeof clockOrLogger.info === "function" &&
      !("now" in clockOrLogger)
    ) {
      resolvedLogger = clockOrLogger as Logger;
      this.clock = new SystemClock();
      this.idGenerator = new UuidGenerator();
    } else {
      this.clock = (clockOrLogger as IClock) ?? new SystemClock();
      this.idGenerator = idGenerator ?? new UuidGenerator();
      if (optionsOrLogger) {
        if (
          "info" in optionsOrLogger &&
          typeof (optionsOrLogger as Logger).info === "function"
        ) {
          resolvedLogger = optionsOrLogger as Logger;
        } else {
          const opts = optionsOrLogger as {
            lockTimeoutMs?: number;
            executionTimeoutMs?: number;
            maxRooms?: number;
            logger?: Logger;
          };
          if (opts.lockTimeoutMs !== undefined)
            this.LOCK_TIMEOUT_MS = opts.lockTimeoutMs;
          if (opts.executionTimeoutMs !== undefined)
            this.EXECUTION_TIMEOUT_MS = opts.executionTimeoutMs;
          if (opts.maxRooms !== undefined) this.maxRooms = opts.maxRooms;
          if (opts.logger) resolvedLogger = opts.logger;
        }
      }
    }
    if (options) {
      if (options.lockTimeoutMs !== undefined)
        this.LOCK_TIMEOUT_MS = options.lockTimeoutMs;
      if (options.executionTimeoutMs !== undefined)
        this.EXECUTION_TIMEOUT_MS = options.executionTimeoutMs;
      if (options.maxRooms !== undefined) this.maxRooms = options.maxRooms;
      if (options.logger) resolvedLogger = options.logger;
    }
    this.logger = resolvedLogger ?? defaultLogger;
  }

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

  private assertTicketValid(code: string, explicitContext?: LockContext): void {
    const ctx = explicitContext ?? this.lockContextStorage.getStore();
    if (!ctx) return;
    if (ctx.roomCode !== code) return;

    if (this.cancelledTickets.has(ctx.ticket) || this.activeTickets.get(code) !== ctx.ticket) {
      throw new StaleLockExecutionError(code, ctx.ticket);
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
    action: (context?: LockContext) => Promise<T>,
  ): Promise<T> {
    const code = roomCode.toUpperCase();
    const currentContext = this.lockContextStorage.getStore();
    if (
      currentContext &&
      currentContext.roomCode === code &&
      !currentContext.isCancelled() &&
      this.activeTickets.get(code) === currentContext.ticket
    ) {
      return await action(currentContext);
    }

    const ticket = ++this.ticketSequence;
    const context: LockContext = {
      roomCode: code,
      ticket,
      isCancelled: () => this.cancelledTickets.has(ticket),
    };

    this.logger?.debug("Lock acquisition requested", {
      operation: "room_lock_acquire_requested",
      roomCode: code,
      ticket,
    });

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
    let timedOut = false;
    try {
      // 1. Lock Acquisition Race (5000ms acquisition timeout)
      await Promise.race([
        prevTail,
        new Promise((_, reject) => {
          acquireTimer = setTimeout(() => {
            this.trackCancelledTicket(ticket);
            this.logger.warn("Lock acquisition timed out", {
              operation: "room_lock_acquire_timeout",
              roomCode: code,
              ticket,
            });
            reject(new LockTimeoutError(code, this.LOCK_TIMEOUT_MS));
          }, this.LOCK_TIMEOUT_MS);
        }),
      ]);
      acquired = true;
      if (acquireTimer) clearTimeout(acquireTimer);

      this.activeTickets.set(code, ticket);
      this.logger.debug("Lock acquired", {
        operation: "room_lock_acquired",
        roomCode: code,
        ticket,
      });

      // 2. Lock Execution Race (5000ms execution timeout) — MAJ-005, CRIT-002
      const executionTimeoutPromise = new Promise<never>((_, reject) => {
        executionTimer = setTimeout(() => {
          timedOut = true;
          this.trackCancelledTicket(ticket);
          if (this.activeTickets.get(code) === ticket) {
            this.activeTickets.delete(code);
          }
          this.logger.warn("Lock execution timed out", {
            operation: "room_lock_execution_timeout",
            roomCode: code,
            ticket,
          });
          reject(new LockExecutionTimeoutError(code, this.EXECUTION_TIMEOUT_MS));
        }, this.EXECUTION_TIMEOUT_MS);
      });

      const actionPromise = this.lockContextStorage.run(context, () => action(context));

      // Absorb post-timeout rejections to prevent unhandled promise rejection (CRIT-002)
      actionPromise.catch((err) => {
        if (timedOut) {
          this.logger.warn("Orphaned lock action rejected after execution timeout", {
            operation: "room_lock_orphaned_action_rejection",
            roomCode: code,
            ticket,
            error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: err },
          });
        }
      });

      return await Promise.race([actionPromise, executionTimeoutPromise]);
    } finally {
      if (acquireTimer) clearTimeout(acquireTimer);
      if (executionTimer) clearTimeout(executionTimer);
      if (acquired) {
        if (this.activeTickets.get(code) === ticket) {
          this.activeTickets.delete(code);
        }
        this.logger?.debug("Lock released", {
          operation: "room_lock_released",
          roomCode: code,
          ticket,
        });
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
        // CRIT-002: Invalidate ticket on timeout before acquisition
        this.trackCancelledTicket(ticket);
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
    return this.withLock(roomCode, async (context) => {
      const code = roomCode.toUpperCase();
      this.assertTicketValid(code, context);

      const existing = this.rooms.get(code);
      if (!existing) {
        throw new RoomNotFoundError(code);
      }

      const clone = structuredClone(existing);
      const expectedVersion = clone.version || 1;

      this.logger?.debug("Room mutation started", {
        operation: "room_mutate_started",
        roomCode: code,
        expectedVersion,
        ticket: context?.ticket,
      });

      const { updatedRoom, result } = await mutator(clone);

      // Re-assert ticket is still valid after mutator resolves (CRIT-002)
      this.assertTicketValid(code, context);

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

      this.logger?.debug("Room mutation completed", {
        operation: "room_mutate_completed",
        roomCode: code,
        nextVersion,
        ticket: context?.ticket,
      });

      return result;
    });
  }

  public async save(room: RoomState, expectedVersion?: number): Promise<void> {
    const code = room.roomCode.toUpperCase();
    this.assertTicketValid(code);

    if (!this.rooms.has(code) && this.rooms.size >= this.maxRooms) {
      throw new RoomCapacityExceededError(this.maxRooms);
    }

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

  public async createIfAbsent(room: RoomState): Promise<void> {
    const code = room.roomCode.toUpperCase();
    await this.withLock(code, async () => {
      if (this.rooms.size >= this.maxRooms) {
        throw new RoomCapacityExceededError(this.maxRooms);
      }
      if (this.rooms.has(code)) {
        throw new RoomAlreadyExistsError(code);
      }
      const roomToSave: RoomState = {
        ...structuredClone(room),
        version: room.version || 1,
        lastActivityAt: room.lastActivityAt ?? this.clock.now(),
      };
      this.rooms.set(code, roomToSave);
      this.indexSockets(roomToSave);
    });
  }

  public async delete(roomCode: string): Promise<boolean> {
    const code = roomCode.toUpperCase();
    return this.withLock(code, async () => {
      this.unindexSockets(code);
      return this.rooms.delete(code);
    });
  }

  public async listActiveRooms(): Promise<RoomState[]> {
    return Array.from(this.rooms.values()).map((r) => structuredClone(r));
  }

  public async count(): Promise<number> {
    return this.rooms.size;
  }

  /**
   * Helper to clear store, active tickets, and queues in tests or maintenance.
   */
  public async clear(): Promise<void> {
    this.lockQueues.clear();
    this.socketIndex.clear();
    this.roomSockets.clear();
    this.rooms.clear();
    this.activeTickets.clear();
    this.cancelledTickets.clear();
  }
}
