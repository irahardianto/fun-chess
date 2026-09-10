import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DisconnectTimerRegistry,
  createDisconnectTimerRegistry,
  defaultDisconnectTimerRegistry,
  resetDefaultDisconnectTimerRegistry,
  cancelDisconnectTimer,
  cancelAllDisconnectTimersForRoom,
  clearAllDisconnectTimers,
  DISCONNECT_GRACE_PERIOD_MS,
} from "../disconnect_timer_registry.js";

describe("DisconnectTimerRegistry", () => {
  let registry: DisconnectTimerRegistry;

  beforeEach(() => {
    registry = new DisconnectTimerRegistry();
    resetDefaultDisconnectTimerRegistry();
  });

  afterEach(() => {
    registry.clear();
    resetDefaultDisconnectTimerRegistry();
    vi.restoreAllMocks();
  });

  it("exports DISCONNECT_GRACE_PERIOD_MS as 60000ms", () => {
    expect(DISCONNECT_GRACE_PERIOD_MS).toBe(60_000);
  });

  it("sets and gets timers keyed by room code and player ID case-insensitively", () => {
    const timer = setTimeout(() => {}, 10_000);
    registry.set("abcd", "p1", timer);

    expect(registry.size()).toBe(1);
    expect(registry.get("ABCD", "p1")).toBe(timer);
    expect(registry.get("abcd", "p1")).toBe(timer);
    expect(registry.get("abcd", "p2")).toBeUndefined();
    expect(registry.get("efgh", "p1")).toBeUndefined();
  });

  it("clears existing timeout when overwriting timer for the same key", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const timer1 = setTimeout(() => {}, 10_000);
    const timer2 = setTimeout(() => {}, 20_000);

    registry.set("ROOM1", "playerA", timer1);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();

    registry.set("room1", "playerA", timer2);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer1);
    expect(registry.get("room1", "playerA")).toBe(timer2);
    expect(registry.size()).toBe(1);
  });

  it("cancels existing timer and returns true", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const timer = setTimeout(() => {}, 10_000);
    registry.set("ROOM2", "playerB", timer);

    const cancelled = registry.cancel("room2", "playerB");
    expect(cancelled).toBe(true);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timer);
    expect(registry.get("room2", "playerB")).toBeUndefined();
    expect(registry.size()).toBe(0);
  });

  it("returns false when cancelling non-existent timer", () => {
    const cancelled = registry.cancel("NONEXIST", "nobody");
    expect(cancelled).toBe(false);
  });

  it("cancels all timers for a specific room without affecting others", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const t1 = setTimeout(() => {}, 10_000);
    const t2 = setTimeout(() => {}, 10_000);
    const t3 = setTimeout(() => {}, 10_000);

    registry.set("ROOM_A", "p1", t1);
    registry.set("room_a", "p2", t2);
    registry.set("ROOM_B", "p1", t3);

    expect(registry.size()).toBe(3);

    registry.cancelAllForRoom("room_a");

    expect(clearTimeoutSpy).toHaveBeenCalledWith(t1);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(t2);
    expect(clearTimeoutSpy).not.toHaveBeenCalledWith(t3);

    expect(registry.get("ROOM_A", "p1")).toBeUndefined();
    expect(registry.get("ROOM_A", "p2")).toBeUndefined();
    expect(registry.get("ROOM_B", "p1")).toBe(t3);
    expect(registry.size()).toBe(1);
  });

  it("clears all timers across all rooms", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const t1 = setTimeout(() => {}, 10_000);
    const t2 = setTimeout(() => {}, 10_000);

    registry.set("R1", "p1", t1);
    registry.set("R2", "p2", t2);
    expect(registry.size()).toBe(2);

    registry.clear();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(t1);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(t2);
    expect(registry.size()).toBe(0);
  });

  describe("Helper Functions", () => {
    it("createDisconnectTimerRegistry creates a new isolated registry instance", () => {
      const reg = createDisconnectTimerRegistry();
      expect(reg).toBeInstanceOf(DisconnectTimerRegistry);
      expect(reg).not.toBe(defaultDisconnectTimerRegistry);
    });

    it("resetDefaultDisconnectTimerRegistry clears default singleton", () => {
      const t = setTimeout(() => {}, 10_000);
      defaultDisconnectTimerRegistry.set("DEF", "p", t);
      expect(defaultDisconnectTimerRegistry.size()).toBe(1);

      resetDefaultDisconnectTimerRegistry();
      expect(defaultDisconnectTimerRegistry.size()).toBe(0);
    });

    it("cancelDisconnectTimer operates on custom or default registry", () => {
      const customReg = createDisconnectTimerRegistry();
      const tCustom = setTimeout(() => {}, 10_000);
      customReg.set("CUST", "p", tCustom);

      expect(cancelDisconnectTimer("CUST", "p", customReg)).toBe(true);
      expect(customReg.size()).toBe(0);

      const tDef = setTimeout(() => {}, 10_000);
      defaultDisconnectTimerRegistry.set("DEF", "p", tDef);
      expect(cancelDisconnectTimer("DEF", "p")).toBe(true);
      expect(defaultDisconnectTimerRegistry.size()).toBe(0);
    });

    it("cancelAllDisconnectTimersForRoom operates on custom or default registry", () => {
      const customReg = createDisconnectTimerRegistry();
      const tCustom = setTimeout(() => {}, 10_000);
      customReg.set("CUST", "p", tCustom);

      cancelAllDisconnectTimersForRoom("CUST", customReg);
      expect(customReg.size()).toBe(0);

      const tDef = setTimeout(() => {}, 10_000);
      defaultDisconnectTimerRegistry.set("DEF", "p", tDef);
      cancelAllDisconnectTimersForRoom("DEF");
      expect(defaultDisconnectTimerRegistry.size()).toBe(0);
    });

    it("clearAllDisconnectTimers operates on custom or default registry", () => {
      const customReg = createDisconnectTimerRegistry();
      const tCustom = setTimeout(() => {}, 10_000);
      customReg.set("CUST", "p", tCustom);

      clearAllDisconnectTimers(customReg);
      expect(customReg.size()).toBe(0);

      const tDef = setTimeout(() => {}, 10_000);
      defaultDisconnectTimerRegistry.set("DEF", "p", tDef);
      clearAllDisconnectTimers();
      expect(defaultDisconnectTimerRegistry.size()).toBe(0);
    });
  });
});
