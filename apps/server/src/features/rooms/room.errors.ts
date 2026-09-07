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
 * Thrown when an optimistic concurrency control version check fails during a room mutation.
 */
export class OptimisticLockConflictError extends AppError {
  constructor(roomCode: string, expectedVersion: number, actualVersion: number) {
    super(
      "ERR_CONFLICT" as ErrorCode,
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
