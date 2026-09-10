import { describe, it, expect } from "vitest";
import { SystemClock, systemClock, MockClock } from "../system_clock.js";

describe("SystemClock & MockClock (ENH-005)", () => {
  describe("SystemClock", () => {
    it("provides now() method returning current millisecond timestamp", () => {
      const clock = new SystemClock();
      const before = Date.now();
      const now = clock.now();
      const after = Date.now();

      expect(typeof now).toBe("number");
      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBeLessThanOrEqual(after);
    });

    it("exports systemClock singleton instance", () => {
      expect(systemClock).toBeInstanceOf(SystemClock);
      expect(typeof systemClock.now()).toBe("number");
    });
  });

  describe("MockClock", () => {
    it("initializes with default or specified time", () => {
      const clockDefault = new MockClock();
      expect(clockDefault.now()).toBe(0);

      const clockCustom = new MockClock(1700000000000);
      expect(clockCustom.now()).toBe(1700000000000);
    });

    it("advances time monotonically", () => {
      const clock = new MockClock(1000);
      clock.advance(500);
      expect(clock.now()).toBe(1500);
      clock.advance(250);
      expect(clock.now()).toBe(1750);
    });

    it("sets time explicitly", () => {
      const clock = new MockClock(1000);
      clock.setTime(5000);
      expect(clock.now()).toBe(5000);
    });

    it("resets time to 0 or specified value", () => {
      const clock = new MockClock(5000);
      clock.reset();
      expect(clock.now()).toBe(0);

      clock.reset(12345);
      expect(clock.now()).toBe(12345);
    });
  });
});
