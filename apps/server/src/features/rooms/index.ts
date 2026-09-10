/**
 * Public API for features/rooms.
 * Cross-module callers must import exclusively from this entry point.
 */
export type { IRoomService, IRoomGameAdapter } from "./room.interface.js";
export type { RoomStore, IRoomStore, RoomMutator } from "./room.store.js";
export { MAX_ROOMS } from "./room.store.js";
export type { SessionRecord, SessionRegistry, ISessionRegistry } from "./session_registry.js";
export { InMemorySessionRegistry } from "./in_memory_session_registry.js";
export { MockSessionRegistry } from "./mock_session_registry.js";
export {
  InMemoryRoomStore,
  type InMemoryRoomStoreOptions,
  type LockContext,
} from "./in_memory_room.store.js";
export { MockRoomStore } from "./mock_room.store.js";
export { RoomService } from "./room.service.js";
export {
  registerRoomSocketHandlers,
  handleSocketDisconnect,
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
  type IDisconnectTimerRegistry,
} from "./disconnect_timer_registry.js";
export {
  sanitizePublicRoom,
  sanitizePublicPlayer,
  createInitialRoomState,
  abandonmentForfeitTransition,
} from "./room.logic.js";
export type { IClock, IIdGenerator } from "@fun-chess/shared";
export {
  SystemTimerService,
  MockTimerService,
  type ITimerService,
  type TimerHandle,
} from "./timer_service.js";
export * from "./room.errors.js";
