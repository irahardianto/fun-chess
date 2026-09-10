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
export {
  RoomCodeGenerator,
  type IRoomCodeGenerator,
  ROOM_CODE_CHARSET,
  ROOM_CODE_LENGTH,
  DEFAULT_MAX_ATTEMPTS,
} from "./room_code_generator.js";
export {
  RematchCoordinator,
  type IRematchCoordinator,
} from "./rematch_coordinator.js";
export {
  DrawCoordinator,
  type IDrawCoordinator,
} from "./draw_coordinator.js";
export {
  RoomLifecycleCoordinator,
  type IRoomLifecycleCoordinator,
} from "./room_lifecycle_coordinator.js";
export {
  RoomMemberCoordinator,
  type IRoomMemberCoordinator,
} from "./room_member_coordinator.js";
export * from "./room.errors.js";
