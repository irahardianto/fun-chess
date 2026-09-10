import { describe, it, expect } from "vitest";
import { canonicalJsonStringify } from "../canonical_json.js";
import { crc32Checksum } from "../checksum_crc32.js";

describe("canonicalJsonStringify (RFC 8785)", () => {
  describe("Primitive values", () => {
    it("serializes numbers, booleans, strings, and null correctly", () => {
      expect(canonicalJsonStringify(42)).toBe("42");
      expect(canonicalJsonStringify(3.14159)).toBe("3.14159");
      expect(canonicalJsonStringify(true)).toBe("true");
      expect(canonicalJsonStringify(false)).toBe("false");
      expect(canonicalJsonStringify("hello world")).toBe('"hello world"');
      expect(canonicalJsonStringify(null)).toBe("null");
    });

    it("serializes top-level undefined to 'null'", () => {
      expect(canonicalJsonStringify(undefined)).toBe("null");
    });
  });

  describe("Object key sorting", () => {
    it("sorts top-level keys lexicographically", () => {
      const input = { b: 1, a: 2 };
      expect(canonicalJsonStringify(input)).toBe('{"a":2,"b":1}');
    });

    it("sorts multiple keys with various alphabetic orders", () => {
      const input = { z: 26, m: 13, a: 1, c: 3 };
      expect(canonicalJsonStringify(input)).toBe('{"a":1,"c":3,"m":13,"z":26}');
    });

    it("sorts nested object keys recursively", () => {
      const input = { z: { b: 1, a: 2 }, y: 3 };
      expect(canonicalJsonStringify(input)).toBe('{"y":3,"z":{"a":2,"b":1}}');
    });

    it("sorts deeply nested object hierarchies", () => {
      const input = {
        level1_b: {
          level2_b: {
            level3_b: "val_b",
            level3_a: "val_a",
          },
          level2_a: 100,
        },
        level1_a: "top",
      };
      expect(canonicalJsonStringify(input)).toBe(
        '{"level1_a":"top","level1_b":{"level2_a":100,"level2_b":{"level3_a":"val_a","level3_b":"val_b"}}}',
      );
    });
  });

  describe("Array handling", () => {
    it("preserves array element order strictly", () => {
      const input = [3, 1, 4, 1, 5, 9];
      expect(canonicalJsonStringify(input)).toBe("[3,1,4,1,5,9]");
    });

    it("sorts nested objects within arrays while preserving array order", () => {
      const input = [
        { b: 1, a: 2 },
        { d: 4, c: 3 },
      ];
      expect(canonicalJsonStringify(input)).toBe(
        '[{"a":2,"b":1},{"c":3,"d":4}]',
      );
    });

    it("serializes undefined as null within arrays", () => {
      const input = [1, undefined, 3];
      expect(canonicalJsonStringify(input)).toBe("[1,null,3]");
    });

    it("serializes symbols and functions as null within arrays", () => {
      const input = [1, Symbol("test"), () => {}, 4];
      expect(canonicalJsonStringify(input)).toBe("[1,null,null,4]");
    });
  });

  describe("Date serialization", () => {
    it("serializes Date instances to ISO 8601 strings", () => {
      const date = new Date("2026-09-07T08:00:00.000Z");
      expect(canonicalJsonStringify(date)).toBe('"2026-09-07T08:00:00.000Z"');
    });

    it("serializes Dates embedded within nested objects and arrays", () => {
      const payload = {
        name: "Test",
        createdAt: new Date("2026-01-01T12:00:00.000Z"),
        history: [new Date("2026-01-01T00:00:00.000Z")],
      };
      expect(canonicalJsonStringify(payload)).toBe(
        '{"createdAt":"2026-01-01T12:00:00.000Z","history":["2026-01-01T00:00:00.000Z"],"name":"Test"}',
      );
    });
  });

  describe("Omission of undefined, function, and symbol object values", () => {
    it("skips undefined object keys", () => {
      const input = { a: 1, b: undefined, c: "hello" };
      expect(canonicalJsonStringify(input)).toBe('{"a":1,"c":"hello"}');
    });

    it("skips function and symbol object properties", () => {
      const input = {
        a: 10,
        fn: () => "ignored",
        sym: Symbol("ignored"),
        z: 20,
      };
      expect(canonicalJsonStringify(input)).toBe('{"a":10,"z":20}');
    });
  });

  describe("CRC-32 Determinism (MAJ-024)", () => {
    it("produces identical CRC-32 checksums for objects with permuted key insertion orders", () => {
      // objA: keys inserted in one order
      const objA = {
        zebra: 10,
        alpha: "start",
        beta: { two: 2, one: 1 },
        items: [{ y: 2, x: 1 }, { b: "second", a: "first" }],
        date: new Date("2026-09-07T00:00:00.000Z"),
      };

      // objB: identical data, keys inserted in completely reversed/different order
      const objB = {
        date: new Date("2026-09-07T00:00:00.000Z"),
        alpha: "start",
        items: [{ x: 1, y: 2 }, { a: "first", b: "second" }],
        zebra: 10,
        beta: { one: 1, two: 2 },
      };

      // Standard JSON.stringify produces different strings due to key order
      expect(JSON.stringify(objA)).not.toBe(JSON.stringify(objB));

      // canonicalJsonStringify produces identical strings
      const canonicalA = canonicalJsonStringify(objA);
      const canonicalB = canonicalJsonStringify(objB);
      expect(canonicalA).toBe(canonicalB);

      // CRC-32 checksums are deterministic and match perfectly
      const crcA = crc32Checksum.calculate(canonicalA);
      const crcB = crc32Checksum.calculate(canonicalB);
      expect(crcA).toBe(crcB);
      expect(crc32Checksum.toHex(crcA)).toBe(crc32Checksum.toHex(crcB));
    });
  });

  describe("MAJ-006: Cycle detection and recursion depth ceiling", () => {
    it("throws TypeError when serializing direct circular object references", () => {
      const circular: Record<string, unknown> = { name: "loop" };
      circular.self = circular;

      expect(() => canonicalJsonStringify(circular)).toThrow(TypeError);
      expect(() => canonicalJsonStringify(circular)).toThrow(
        "Converting circular structure to JSON in canonicalJsonStringify",
      );
    });

    it("throws TypeError when serializing indirect circular object references", () => {
      const objA: Record<string, unknown> = { id: "a" };
      const objB: Record<string, unknown> = { id: "b", a: objA };
      objA.b = objB;

      expect(() => canonicalJsonStringify(objA)).toThrow(TypeError);
      expect(() => canonicalJsonStringify(objB)).toThrow(TypeError);
    });

    it("throws TypeError when serializing circular array references", () => {
      const arr: unknown[] = [1, 2];
      arr.push(arr);

      expect(() => canonicalJsonStringify(arr)).toThrow(TypeError);
    });

    it("correctly serializes non-circular DAG structures with shared object references", () => {
      const sharedLeaf = { value: "shared", count: 42 };
      const dag = {
        branchA: sharedLeaf,
        branchB: sharedLeaf,
      };

      const result = canonicalJsonStringify(dag);
      expect(result).toBe('{"branchA":{"count":42,"value":"shared"},"branchB":{"count":42,"value":"shared"}}');
    });

    it("serializes nested objects up to the 64-level depth ceiling successfully", () => {
      // Build an object exactly 64 levels deep
      let current: Record<string, unknown> = { leaf: "value" };
      for (let i = 0; i < 63; i++) {
        current = { next: current };
      }

      expect(() => canonicalJsonStringify(current)).not.toThrow();
    });

    it("throws RangeError when object nesting exceeds the 64-level depth ceiling", () => {
      // Build an object 65 levels deep
      let current: Record<string, unknown> = { leaf: "deep" };
      for (let i = 0; i < 64; i++) {
        current = { next: current };
      }

      expect(() => canonicalJsonStringify(current)).toThrow(RangeError);
      expect(() => canonicalJsonStringify(current)).toThrow("Maximum canonical JSON depth of 64 exceeded");
    });

    it("throws RangeError when array nesting exceeds the 64-level depth ceiling", () => {
      let currentArr: unknown[] = [1];
      for (let i = 0; i < 64; i++) {
        currentArr = [currentArr];
      }

      expect(() => canonicalJsonStringify(currentArr)).toThrow(RangeError);
      expect(() => canonicalJsonStringify(currentArr)).toThrow("Maximum canonical JSON depth of 64 exceeded");
    });
  });
});
