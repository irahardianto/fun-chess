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
  | "ERR_INTERNAL_SERVER";

export interface SocketErrorPayload {
  code: ErrorCode;
  message: string;
  roomCode?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export type PuzzleErrorCode =
  | "ERR_PUZZLE_NOT_FOUND"
  | "ERR_INVALID_PUZZLE_FEN"
  | "ERR_MALFORMED_SOLUTION_LINE"
  | "ERR_STORAGE_UNAVAILABLE"
  | "ERR_STORAGE_PARSE_FAILED"
  | "ERR_INVALID_THEME"
  | "ERR_RUSH_ALREADY_FINISHED";

export interface PuzzleErrorPayload {
  readonly code: PuzzleErrorCode;
  readonly message: string;
  readonly puzzleId?: string;
  readonly details?: Record<string, unknown>;
}
