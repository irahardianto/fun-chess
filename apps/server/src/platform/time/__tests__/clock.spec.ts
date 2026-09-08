import { describe, it, expect } from "vitest";
import { SystemClock, UuidGenerator } from "../clock.js";
import { MockClock, MockIdGenerator } from "../mock_clock.js";

describe("Platform Time & ID Abstractions", () => {
  describe("SystemClock", () => {
    it("returns current unix timestamp in milliseconds", () => {
      const clock = new SystemClock();
      const before = Date.now();
      const now = clock.now();
      const after = Date.now();

      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBeLessThanOrEqual(after);
    });
  });

  describe("UuidGenerator", () => {
    it("generates unique valid UUIDv4 strings", () => {
      const generator = new UuidGenerator();
      const id1 = generator.generateId();
      const id2 = generator.generateId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("generates pseudo-random integers within [min, max)", () => {
      const generator = new UuidGenerator();
      for (let i = 0; i < 20; i++) {
        const val = generator.generateRandomInt(5, 10);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThan(10);
      }
    });
  });

  describe("MockClock", () => {
    it("returns initial time and allows advancing time", () => {
      const mock = new MockClock(1000);
      expect(mock.now()).toBe(1000);

      mock.advance(500);
      expect(mock.now()).toBe(1500);

      mock.set(5000);
      expect(mock.now()).toBe(5000);
    });
  });

  describe("MockIdGenerator", () => {
    it("returns sequential test IDs when none predefined", () => {
      const mock = new MockIdGenerator();
      expect(mock.generateId()).toBe("test-id-1");
      expect(mock.generateId()).toBe("test-id-2");
    });

    it("drains predefined IDs first before falling back to counter", () => {
      const mock = new MockIdGenerator(["custom-a", "custom-b"]);
      expect(mock.generateId()).toBe("custom-a");
      expect(mock.generateId()).toBe("custom-b");
      expect(mock.generateId()).toBe("test-id-1");
    });

    it("generates deterministic random int returning min", () => {
      const mock = new MockIdGenerator();
      expect(mock.generateRandomInt(10, 20)).toBe(10);
    });
  });
});
