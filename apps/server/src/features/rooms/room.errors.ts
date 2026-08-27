import { ErrorCode } from "@fun-chess/shared";

/**
 * Base domain exception class with explicit ErrorCode, HTTP status, and metadata details.
 */
export abstract class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

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

export class RoomAlreadyExistsError extends AppError {
  constructor(roomCode: string) {
    super("ERR_ROOM_ALREADY_EXISTS", `Room '${roomCode}' already exists`, 409, {
      roomCode,
    });
  }
}

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

export class InvalidMoveError extends AppError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super("ERR_INVALID_MOVE", `Illegal chess move: ${reason}`, 422, details);
  }
}

export class NotYourTurnError extends AppError {
  constructor() {
    super("ERR_NOT_YOUR_TURN", "It is not your turn to move", 403);
  }
}

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

export class UnauthorizedError extends AppError {
  constructor(
    message = "Unauthorized session token or invalid player credentials",
  ) {
    super("ERR_UNAUTHORIZED", message, 401);
  }
}

export class InvalidPayloadError extends AppError {
  constructor(field: string, reason: string) {
    super("ERR_INVALID_PAYLOAD", `Invalid payload: ${field} - ${reason}`, 400, {
      field,
      reason,
    });
  }
}
