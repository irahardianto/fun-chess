import { RoomState } from "@fun-chess/shared";

/**
 * Mutation function callback executed inside the room's exclusive lock.
 * Receives the current deep-cloned RoomState and returns the updated RoomState plus an arbitrary result.
 */
export type RoomMutator<T> = (
  current: RoomState,
) => Promise<{ updatedRoom: RoomState; result: T }> | { updatedRoom: RoomState; result: T };

export interface StorageQueryOptions {
  /** Optional AbortSignal for aborting in-flight or queued queries (ENH-015) */
  signal?: AbortSignal;
  /** Correlation ID for distributed tracing across service boundaries (MAJ-017) */
  correlationId?: string;
}

export interface StorageMutationOptions extends StorageQueryOptions {}

/**
 * Storage boundary abstraction for room persistence.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 * Supports AbortSignal query cancellation across all asynchronous methods (ENH-015).
 */
export interface RoomStore {
  /**
   * Retrieves a read-only snapshot of the room state (ENH-013).
   */
  findByCode(
    roomCode: string,
    options?: StorageQueryOptions,
  ): Promise<Readonly<RoomState> | null>;

  /**
   * Finds room and player by socket ID with index self-healing.
   */
  findBySocketId(
    socketId: string,
    options?: StorageQueryOptions,
  ): Promise<{ room: Readonly<RoomState>; playerId: string } | null>;

  /**
   * Atomically executes a mutator function within the room's exclusive lock.
   * Handles lock acquisition, state retrieval, optimistic version check, version increment, and persistence.
   *
   * @param roomCode - 4-letter uppercase room code
   * @param mutator - Pure mutation callback returning updated room and caller result
   * @param options - Mutation options including AbortSignal and correlationId, or correlationId string
   * @returns The result returned by the mutator
   * @throws RoomNotFoundError if roomCode does not exist
   * @throws OptimisticLockConflictError if version precondition fails
   */
  mutate<T>(
    roomCode: string,
    mutator: RoomMutator<T>,
    options?: StorageMutationOptions | string,
  ): Promise<T>;

  /**
   * Executes an arbitrary asynchronous callback within the room's exclusive lock.
   */
  withLock<T>(
    roomCode: string,
    action: () => Promise<T>,
    correlationId?: string,
    options?: StorageQueryOptions,
  ): Promise<T>;

  /**
   * Saves a room state with CAS version validation.
   * If expectedVersion is provided, rejects if current.version !== expectedVersion.
   * Increments room.version by 1 on successful persist.
   */
  save(
    room: RoomState,
    expectedVersion?: number,
    options?: StorageMutationOptions,
  ): Promise<void>;

  /**
   * Atomically creates and persists a room if and only if no room with this roomCode currently exists.
   * Guaranteed atomic under the room code's exclusive lock.
   *
   * @param room - The initial room state to persist
   * @throws RoomAlreadyExistsError if a room with this code already exists
   */
  createIfAbsent(
    room: RoomState,
    options?: StorageMutationOptions,
  ): Promise<void>;

  /**
   * Deletes a room from storage and clears its pending lock queue and socket indexes.
   */
  delete(
    roomCode: string,
    options?: StorageMutationOptions,
  ): Promise<boolean>;

  /**
   * Lists all active rooms.
   */
  listActiveRooms(
    options?: StorageQueryOptions,
  ): Promise<Readonly<RoomState>[]>;

  /**
   * Returns current active room count.
   */
  count(
    options?: StorageQueryOptions,
  ): Promise<number>;

  /**
   * Clears all room entries and releases all pending lock chains (for shutdown and testing).
   */
  clear(
    options?: StorageMutationOptions,
  ): Promise<void>;
}

export type IRoomStore = RoomStore;

/**
 * Maximum capacity of active rooms permitted in memory.
 */
export const MAX_ROOMS = 10_000;
