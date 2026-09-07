/**
 * Public API for features/game.
 * Cross-module callers must import exclusively from this entry point.
 */
export { ChessEngine } from "./chess_engine.js";
export type {
  ValidationSuccess,
  ValidationFailure,
  MoveValidationOutcome,
  MoveValidationResult,
  MoveApplicationOutcome,
} from "./chess_engine.js";
export type {
  IGameService,
  MoveApplicationResult,
} from "./game.interface.js";
export { GameService } from "./game.service.js";
export { registerGameSocketHandlers } from "./game.socket_handler.js";
export {
  SystemClock,
  UuidGenerator,
} from "./clock.js";
export type {
  IClock,
  IIdGenerator,
} from "./clock.js";

