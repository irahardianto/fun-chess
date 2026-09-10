/**
 * Public API for platform/time.
 * Cross-module callers must import exclusively from this entry point.
 */
export { SystemClock, UuidGenerator } from "./clock.js";
export type { IClock, IIdGenerator } from "./clock.js";
export { SystemTimerService } from "./system_timer.service.js";
export type { ITimerService, TimerHandle } from "@fun-chess/shared";
