import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SystemTimerService } from "../system_timer.service.js";

describe("SystemTimerService (MAJ-008, MIN-011)", () => {
  let timerService: SystemTimerService;

  beforeEach(() => {
    vi.useFakeTimers();
    timerService = new SystemTimerService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("setTimeout", () => {
    it("executes callback after specified delay", () => {
      const callback = vi.fn();
      timerService.setTimeout(callback, 1000);

      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(999);
      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("returns handle with ref and unref functions", () => {
      const callback = vi.fn();
      const handle = timerService.setTimeout(callback, 500);

      expect(handle).toBeDefined();
      expect(typeof handle.ref).toBe("function");
      expect(typeof handle.unref).toBe("function");
      expect(handle.id).toBeDefined();

      // Ensure calling ref and unref does not throw
      expect(() => handle.ref?.()).not.toThrow();
      expect(() => handle.unref?.()).not.toThrow();
    });

    it("cancels timer via clearTimeout with handle", () => {
      const callback = vi.fn();
      const handle = timerService.setTimeout(callback, 1000);

      timerService.clearTimeout(handle);
      vi.advanceTimersByTime(2000);

      expect(callback).not.toHaveBeenCalled();
    });

    it("cancels timer via clearTimeout with raw timer id", () => {
      const callback = vi.fn();
      const handle = timerService.setTimeout(callback, 1000);

      timerService.clearTimeout(handle.id);
      vi.advanceTimersByTime(2000);

      expect(callback).not.toHaveBeenCalled();
    });

    it("handles undefined, null, or unknown values in clearTimeout without error", () => {
      expect(() => timerService.clearTimeout(undefined)).not.toThrow();
      expect(() => timerService.clearTimeout(null)).not.toThrow();
      expect(() => timerService.clearTimeout({})).not.toThrow();
      expect(() => timerService.clearTimeout("invalid")).not.toThrow();
    });

    it("handles async callbacks without unhandled rejection", async () => {
      let resolved = false;
      const asyncCb = vi.fn().mockImplementation(async () => {
        resolved = true;
      });

      timerService.setTimeout(asyncCb, 500);
      vi.advanceTimersByTime(500);
      await Promise.resolve();

      expect(asyncCb).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(true);
    });
  });

  describe("setInterval", () => {
    it("executes callback periodically every intervalMs", () => {
      const callback = vi.fn();
      timerService.setInterval(callback, 250);

      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(250);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(250);
      expect(callback).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(4);
    });

    it("returns handle with ref, unref, and id", () => {
      const callback = vi.fn();
      const handle = timerService.setInterval(callback, 100);

      expect(handle).toBeDefined();
      expect(typeof handle.ref).toBe("function");
      expect(typeof handle.unref).toBe("function");
      expect(handle.id).toBeDefined();

      expect(() => handle.ref?.()).not.toThrow();
      expect(() => handle.unref?.()).not.toThrow();
    });

    it("cancels periodic timer via clearInterval with handle", () => {
      const callback = vi.fn();
      const handle = timerService.setInterval(callback, 200);

      vi.advanceTimersByTime(400);
      expect(callback).toHaveBeenCalledTimes(2);

      timerService.clearInterval(handle);
      vi.advanceTimersByTime(600);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it("cancels periodic timer via clearInterval with raw id", () => {
      const callback = vi.fn();
      const handle = timerService.setInterval(callback, 200);

      vi.advanceTimersByTime(200);
      expect(callback).toHaveBeenCalledTimes(1);

      timerService.clearInterval(handle.id);
      vi.advanceTimersByTime(400);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("handles undefined, null, or unknown values in clearInterval without error", () => {
      expect(() => timerService.clearInterval(undefined)).not.toThrow();
      expect(() => timerService.clearInterval(null)).not.toThrow();
      expect(() => timerService.clearInterval({})).not.toThrow();
      expect(() => timerService.clearInterval(12345)).not.toThrow();
    });

    it("handles async recurring callbacks", async () => {
      let count = 0;
      const asyncCb = vi.fn().mockImplementation(async () => {
        count++;
      });

      timerService.setInterval(asyncCb, 300);
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      expect(count).toBe(1);

      vi.advanceTimersByTime(300);
      await Promise.resolve();
      expect(count).toBe(2);
    });
  });
});
