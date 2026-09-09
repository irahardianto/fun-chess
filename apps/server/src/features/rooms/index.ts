/**
 * Public API for features/rooms.
 * Cross-module callers must import exclusively from this entry point.
 */
export type { IRoomService, IRoomGameAdapter } from "./room.interface.js";
export type { RoomStore, IRoomStore, RoomMutator } from "./room.store.js";
export type { SessionRecord, SessionRegistry } from "./session_registry.js";
export { InMemorySessionRegistry } from "./in_memory_session_registry.js";
export { InMemoryRoomStore, MAX_ROOMS, type LockContext } from "./in_memory_room.store.js";
export { MockRoomStore } from "./mock_room.store.js";
export { RoomService } from "./room.service.js";
export {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
  roomCreateRateLimiter,
} from "./room.socket_handler.js";
export {
  DisconnectTimerRegistry,
  defaultDisconnectTimerRegistry,
  createDisconnectTimerRegistry,
  resetDefaultDisconnectTimerRegistry,
  cancelDisconnectTimer,
  cancelAllDisconnectTimersForRoom,
  clearAllDisconnectTimers,
  DISCONNECT_GRACE_PERIOD_MS,
} from "./disconnect_timer_registry.js";
export type { IDisconnectTimerRegistry } from "./disconnect_timer_registry.js";
export {
  SystemClock,
  UuidGenerator,
} from "../../platform/time/index.js";
export type {
  IClock,
  IIdGenerator,
} from "@fun-chess/shared";
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
  LockExecutionTimeoutError,
  RoomAlreadyExistsError,
  StaleLockExecutionError,
  RoomCapacityExceededError,
} from "./room.errors.js";
