import { AppError, type ErrorCode } from "@fun-chess/shared";

export {
  AppError,
  RoomNotFoundError,
  RoomFullError,
  InvalidRoomCodeError,
  InvalidMoveError,
  NotYourTurnError,
  GameNotActiveError,
  PlayerNotInRoomError,
  UnauthorizedError,
  InvalidPayloadError,
  RateLimitExceededError,
} from "@fun-chess/shared";

/**
 * Thrown when attempting to create a room that already exists in storage.
 * Addresses CRIT-003: Atomic createIfAbsent under lock.
 */
export class RoomAlreadyExistsError extends AppError {
  constructor(roomCode: string) {
    super(
      "ERR_ROOM_ALREADY_EXISTS",
      `Room with code '${roomCode}' already exists`,
      409,
      { roomCode },
    );
    this.name = "RoomAlreadyExistsError";
  }
}

/**
 * Thrown when an operation holding an expired or invalidated lock ticket attempts to persist state.
 * Addresses CRIT-002: Rejects writes from backgrounded timed-out lock executions.
 */
export class StaleLockExecutionError extends AppError {
  constructor(roomCode: string, ticket: number) {
    super(
      "ERR_STALE_LOCK_EXECUTION" as unknown as ErrorCode,
      `Stale lock execution detected for room '${roomCode}' (ticket #${ticket}). Operation cancelled or expired.`,
      409,
      { roomCode, ticket },
    );
    this.name = "StaleLockExecutionError";
  }
}

/**
 * Thrown when an optimistic concurrency control version check fails during a room mutation.
 */
export class OptimisticLockConflictError extends AppError {
  constructor(roomCode: string, expectedVersion: number, actualVersion: number) {
    super(
      "ERR_CONFLICT",
      `State conflict for room '${roomCode}': expected version ${expectedVersion}, found ${actualVersion}. The room was updated concurrently.`,
      409,
      { roomCode, expectedVersion, actualVersion },
    );
  }
}

/**
 * Thrown when an operation times out waiting to acquire a room's exclusive lock.
 */
export class LockTimeoutError extends AppError {
  constructor(roomCode: string, timeoutMs: number) {
    super(
      "ERR_SOCKET_TIMEOUT",
      `Timed out waiting for lock on room '${roomCode}' after ${timeoutMs}ms`,
      408,
      { roomCode, timeoutMs },
    );
  }
}

/**
 * Thrown when an operation times out while actively executing inside a room's exclusive lock.
 * Addresses MAJ-005: Prevents hung actions from blocking room operations indefinitely.
 */
export class LockExecutionTimeoutError extends AppError {
  constructor(roomCode: string, timeoutMs: number) {
    super(
      "ERR_SOCKET_TIMEOUT",
      `Execution timed out while holding lock on room '${roomCode}' after ${timeoutMs}ms`,
      408,
      { roomCode, timeoutMs, phase: "execution" },
    );
    this.name = "LockExecutionTimeoutError";
  }
}

/**
 * Thrown when maximum server room capacity is reached.
 */
export class RoomCapacityExceededError extends AppError {
  constructor(maxRooms: number) {
    super(
      "ERR_INTERNAL_SERVER",
      `Maximum room capacity reached (${maxRooms})`,
      507,
      { maxRooms },
    );
    this.name = "RoomCapacityExceededError";
  }
}
