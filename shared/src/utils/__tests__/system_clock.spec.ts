import { describe, it, expect } from "vitest";
import { SystemClock, systemClock } from "../system_clock.js";

describe("SystemClock (ENH-006)", () => {
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
