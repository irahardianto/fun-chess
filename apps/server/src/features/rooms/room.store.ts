import { RoomState } from "@fun-chess/shared";

/**
 * Mutation function callback executed inside the room's exclusive lock.
 * Receives the current deep-cloned RoomState and returns the updated RoomState plus an arbitrary result.
 */
export type RoomMutator<T> = (
  current: RoomState,
) => Promise<{ updatedRoom: RoomState; result: T }> | { updatedRoom: RoomState; result: T };

/**
 * Storage boundary abstraction for room persistence.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 */
export interface RoomStore {
  /**
   * Retrieves a deep-cloned snapshot of the room state.
   */
  findByCode(roomCode: string): Promise<RoomState | null>;

  /**
   * Finds room and player by socket ID.
   */
  findBySocketId(
    socketId: string,
  ): Promise<{ room: RoomState; playerId: string } | null>;

  /**
   * Atomically executes a mutator function within the room's exclusive lock.
   * Handles lock acquisition, state retrieval, optimistic version check, version increment, and persistence.
   *
   * @param roomCode - 4-letter uppercase room code
   * @param mutator - Pure mutation callback returning updated room and caller result
   * @returns The result returned by the mutator
   * @throws RoomNotFoundError if roomCode does not exist
   * @throws OptimisticLockConflictError if version precondition fails
   */
  mutate<T>(roomCode: string, mutator: RoomMutator<T>): Promise<T>;

  /**
   * Executes an arbitrary asynchronous callback within the room's exclusive lock.
   */
  withLock<T>(roomCode: string, action: () => Promise<T>): Promise<T>;

  /**
   * Saves a room state with CAS version validation.
   * If expectedVersion is provided, rejects if current.version !== expectedVersion.
   * Increments room.version by 1 on successful persist.
   */
  save(room: RoomState, expectedVersion?: number): Promise<void>;

  /**
   * Deletes a room from storage and clears its pending lock queue.
   */
  delete(roomCode: string): Promise<boolean>;

  /**
   * Lists all active rooms.
   */
  listActiveRooms(): Promise<RoomState[]>;

  /**
   * Returns current active room count.
   */
  count(): Promise<number>;

  /**
   * Clears all room entries and releases all pending lock chains (for shutdown and testing).
   */
  clear(): Promise<void>;
}
