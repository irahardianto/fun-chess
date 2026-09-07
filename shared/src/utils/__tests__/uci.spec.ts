import { describe, it, expect } from "vitest";
import {
  isValidUci,
  parseUci,
  parseUciMove,
  toUci,
  formatPlayerMoveToUci,
} from "../uci.js";

describe("UCI Utilities (MAJ-015)", () => {
  describe("isValidUci", () => {
    it("validates standard 4-character move strings", () => {
      expect(isValidUci("e2e4")).toBe(true);
      expect(isValidUci("g1f3")).toBe(true);
      expect(isValidUci("e7e8")).toBe(true);
    });

    it("validates 5-character promotion move strings", () => {
      expect(isValidUci("e7e8q")).toBe(true);
      expect(isValidUci("a7a8r")).toBe(true);
      expect(isValidUci("b2b1b")).toBe(true);
      expect(isValidUci("c2c1n")).toBe(true);
      expect(isValidUci("e7e8Q")).toBe(true);
    });

    it("rejects malformed or non-string inputs", () => {
      expect(isValidUci("")).toBe(false);
      expect(isValidUci("e2")).toBe(false);
      expect(isValidUci("e2e4e5")).toBe(false);
      expect(isValidUci("e2e9")).toBe(false);
      expect(isValidUci("i1i2")).toBe(false);
      expect(isValidUci(123 as unknown as string)).toBe(false);
    });
  });

  describe("parseUci / parseUciMove", () => {
    it("parses standard moves without promotion", () => {
      const parsed = parseUci("e2e4");
      expect(parsed).toEqual({
        from: "e2",
        to: "e4",
        promotion: undefined,
      });
      expect(parseUciMove("e2e4")).toEqual(parsed);
    });

    it("parses promotion moves with piece lowercased", () => {
      expect(parseUci("e7e8q")).toEqual({
        from: "e7",
        to: "e8",
        promotion: "q",
      });
      expect(parseUci("e7e8Q")).toEqual({
        from: "e7",
        to: "e8",
        promotion: "q",
      });
      expect(parseUci("a2a1r")).toEqual({
        from: "a2",
        to: "a1",
        promotion: "r",
      });
    });

    it("ignores invalid promotion characters", () => {
      expect(parseUci("e7e8x")).toEqual({
        from: "e7",
        to: "e8",
        promotion: undefined,
      });
    });
  });

  describe("toUci / formatPlayerMoveToUci", () => {
    it("formats moves without promotion", () => {
      expect(toUci({ from: "e2", to: "e4" })).toBe("e2e4");
      expect(formatPlayerMoveToUci({ from: "e2", to: "e4" })).toBe("e2e4");
    });

    it("formats moves with promotion lowercased", () => {
      expect(toUci({ from: "e7", to: "e8", promotion: "q" })).toBe("e7e8q");
      expect(toUci({ from: "e7", to: "e8", promotion: "Q" })).toBe("e7e8q");
      expect(formatPlayerMoveToUci({ from: "e7", to: "e8", promotion: "n" })).toBe("e7e8n");
    });

    it("handles null/undefined promotion safely", () => {
      expect(toUci({ from: "d2", to: "d4", promotion: null })).toBe("d2d4");
      expect(toUci({ from: "d2", to: "d4", promotion: undefined })).toBe("d2d4");
    });
  });
});
