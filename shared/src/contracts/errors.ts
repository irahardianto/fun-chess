/**
 * Standardized domain error codes across client and server.
 */
export type ErrorCode =
  | "ERR_ROOM_NOT_FOUND"
  | "ERR_ROOM_FULL"
  | "ERR_ROOM_ALREADY_EXISTS"
  | "ERR_INVALID_ROOM_CODE"
  | "ERR_INVALID_MOVE"
  | "ERR_NOT_YOUR_TURN"
  | "ERR_GAME_NOT_ACTIVE"
  | "ERR_PLAYER_NOT_IN_ROOM"
  | "ERR_UNAUTHORIZED"
  | "ERR_INVALID_PAYLOAD"
  | "ERR_RATE_LIMITED"
  | "ERR_SOCKET_TIMEOUT"
  | "ERR_CONFLICT"
  | "ERR_INTERNAL_SERVER";

/**
 * Normalized wire error payload transmitted over Socket.io acknowledgements or error events.
 */
export interface SocketErrorPayload {
  /** Domain error classification code */
  readonly code: ErrorCode;
  /** Human-readable error description safe for client display */
  readonly message: string;
  /** Associated room code, if applicable */
  readonly roomCode?: string;
  /** UUID tracing correlation identifier */
  readonly correlationId?: string;
  /** Additional structured error diagnostics */
  readonly details?: Record<string, unknown>;
}

/**
 * Domain error codes specific to puzzle training and rating operations.
 */
export type PuzzleErrorCode =
  | "ERR_PUZZLE_NOT_FOUND"
  | "ERR_INVALID_PUZZLE_FEN"
  | "ERR_MALFORMED_SOLUTION_LINE"
  | "ERR_STORAGE_UNAVAILABLE"
  | "ERR_STORAGE_PARSE_FAILED"
  | "ERR_INVALID_THEME"
  | "ERR_RUSH_ALREADY_FINISHED";

/**
 * Error payload for puzzle and training failures.
 */
export interface PuzzleErrorPayload {
  readonly code: PuzzleErrorCode;
  readonly message: string;
  readonly puzzleId?: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Base domain exception class with explicit ErrorCode, HTTP status, and metadata details.
 * All domain errors inherit from this class to ensure consistent serialization and logging.
 */
export abstract class AppError extends Error {
  public readonly isAppError = true;

  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a requested room code does not exist.
 */
export class RoomNotFoundError extends AppError {
  constructor(roomCode: string) {
    super(
      "ERR_ROOM_NOT_FOUND",
      `Room with code '${roomCode}' does not exist`,
      404,
      { roomCode },
    );
  }
}

/**
 * Error thrown when attempting to join a room that already has two players.
 */
export class RoomFullError extends AppError {
  constructor(roomCode: string) {
    super(
      "ERR_ROOM_FULL",
      `Room '${roomCode}' already has 2 active players`,
      409,
      { roomCode },
    );
  }
}

/**
 * Error thrown when a room code is syntactically invalid.
 */
export class InvalidRoomCodeError extends AppError {
  constructor(roomCode: string) {
    super(
      "ERR_INVALID_ROOM_CODE",
      `Invalid room code '${roomCode}'. Code must be 4 uppercase characters`,
      400,
      { roomCode },
    );
  }
}

/**
 * Error thrown when an illegal or impossible chess move is attempted.
 */
export class InvalidMoveError extends AppError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super("ERR_INVALID_MOVE", `Illegal chess move: ${reason}`, 422, details);
  }
}

/**
 * Error thrown when a player attempts to move out of turn.
 */
export class NotYourTurnError extends AppError {
  constructor() {
    super("ERR_NOT_YOUR_TURN", "It is not your turn to move", 403);
  }
}

/**
 * Error thrown when an operation requires an active match but the game is in lobby, over, or paused.
 */
export class GameNotActiveError extends AppError {
  constructor(status: string) {
    super(
      "ERR_GAME_NOT_ACTIVE",
      `Game is not currently active (current status: ${status})`,
      400,
      { status },
    );
  }
}

/**
 * Error thrown when a socket participant attempts a player operation without being registered in the room.
 */
export class PlayerNotInRoomError extends AppError {
  constructor(socketId?: string) {
    super(
      "ERR_PLAYER_NOT_IN_ROOM",
      "Socket does not belong to an active player in this room",
      403,
      { socketId },
    );
  }
}

/**
 * Error thrown when session authentication fails or reconnect credentials are expired/invalid.
 */
export class UnauthorizedError extends AppError {
  constructor(
    message = "Unauthorized session token or invalid player credentials",
  ) {
    super("ERR_UNAUTHORIZED", message, 401);
  }
}

/**
 * Error thrown when input fails validation against schemas.
 */
export class InvalidPayloadError extends AppError {
  constructor(field: string, reason: string) {
    super("ERR_INVALID_PAYLOAD", `Invalid payload: ${field} - ${reason}`, 400, {
      field,
      reason,
    });
  }
}

/**
 * Error thrown when client rate limits are exceeded.
 */
export class RateLimitExceededError extends AppError {
  constructor(
    message = "Rate limit exceeded. Please wait before retrying.",
    details?: Record<string, unknown>,
  ) {
    super("ERR_RATE_LIMITED", message, 429, details);
  }
}

/**
 * Error thrown when an optimistic concurrency control version check fails during a room mutation.
 * Single source of truth for prototype identity across all monorepo packages (MAJ-005).
 */
export class OptimisticLockConflictError extends AppError {
  public readonly roomCode: string;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(roomCode: string, expectedVersion: number, actualVersion: number) {
    super(
      "ERR_CONFLICT",
      `State conflict for room '${roomCode}': expected version ${expectedVersion}, found ${actualVersion}. The room was updated concurrently.`,
      409,
      { roomCode, expectedVersion, actualVersion },
    );
    this.name = "OptimisticLockConflictError";
    this.roomCode = roomCode;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;

    Object.setPrototypeOf(this, OptimisticLockConflictError.prototype);
  }
}

