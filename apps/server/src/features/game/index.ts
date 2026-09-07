/**
 * Public API for features/game.
 * Cross-module callers must import exclusively from this entry point.
 */
export { ChessEngine } from "./chess_engine.js";
export type {
  ValidationSuccess,
  ValidationFailure,
  MoveValidationOutcome,
} from "./chess_engine.js";
export { GameService } from "./game.service.js";
export type { MoveApplicationResult } from "./game.service.js";
export { registerGameSocketHandlers } from "./game.socket_handler.js";
