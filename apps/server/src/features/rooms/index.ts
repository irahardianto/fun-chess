/**
 * Public API for features/rooms.
 * Cross-module callers must import exclusively from this entry point.
 */
export type { IRoomService } from "./room.interface.js";
export type { RoomStore, RoomMutator } from "./room.store.js";
export type { SessionRecord, SessionRegistry } from "./session_registry.js";
export { InMemorySessionRegistry } from "./in_memory_session_registry.js";
export { InMemoryRoomStore } from "./in_memory_room.store.js";
export { MockRoomStore } from "./mock_room.store.js";
export { RoomService } from "./room.service.js";
export {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
  cancelDisconnectTimer,
  cancelAllDisconnectTimersForRoom,
  clearAllDisconnectTimers,
  DISCONNECT_GRACE_PERIOD_MS,
} from "./room.socket_handler.js";
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
  OptimisticLockConflictError,
  LockTimeoutError,
} from "./room.errors.js";
