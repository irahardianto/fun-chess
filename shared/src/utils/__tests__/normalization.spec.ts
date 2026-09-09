import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { normalizeRoomCode, validatePlayerName } from "../normalization.js";

describe("Shared Normalization Helpers (MAJ-009)", () => {
  describe("normalizeRoomCode", () => {
    it("trims whitespace and converts lowercase room code to uppercase", () => {
      expect(normalizeRoomCode("abcd")).toBe("ABCD");
      expect(normalizeRoomCode("  abcd  ")).toBe("ABCD");
      expect(normalizeRoomCode("\tabcd\n")).toBe("ABCD");
    });

    it("handles mixed case room codes with whitespace", () => {
      expect(normalizeRoomCode(" aBcD ")).toBe("ABCD");
      expect(normalizeRoomCode("WxYz")).toBe("WXYZ");
    });

    it("handles empty strings and nullish inputs safely", () => {
      expect(normalizeRoomCode("")).toBe("");
      expect(normalizeRoomCode("   ")).toBe("");
      expect(normalizeRoomCode(null as unknown as string)).toBe("");
      expect(normalizeRoomCode(undefined as unknown as string)).toBe("");
    });
  });

  describe("validatePlayerName", () => {
    it("validates and returns trimmed valid player names", () => {
      expect(validatePlayerName("Alice")).toBe("Alice");
      expect(validatePlayerName("  Bob_123  ")).toBe("Bob_123");
      expect(validatePlayerName("Charlie-Brown.99")).toBe("Charlie-Brown.99");
      expect(validatePlayerName("Player 1")).toBe("Player 1");
    });

    it("throws ZodError on empty or whitespace-only names", () => {
      expect(() => validatePlayerName("")).toThrowError(ZodError);
      expect(() => validatePlayerName("   ")).toThrowError(ZodError);
    });

    it("throws ZodError when name exceeds 20 characters", () => {
      const longName = "A".repeat(21);
      expect(() => validatePlayerName(longName)).toThrowError(ZodError);
    });

    it("throws ZodError when name contains disallowed characters", () => {
      const invalidNames = [
        "Alice$123",
        "Player@Home",
        "Bob#1",
        "Evil<script>",
        "Player🦁",
        "Invalid/Slash",
      ];

      for (const name of invalidNames) {
        expect(() => validatePlayerName(name)).toThrowError(ZodError);
      }
    });
  });
});
