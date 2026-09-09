import { describe, it, expect } from "vitest";
import { squareToCoords, coordsToSquare } from "../coordinates.js";

describe("Algebraic Coordinate Utilities (MIN-013)", () => {
  describe("squareToCoords", () => {
    it("converts standard squares to board coordinates", () => {
      expect(squareToCoords("a1")).toEqual({ file: 0, rank: 0, row: 7, col: 0 });
      expect(squareToCoords("a8")).toEqual({ file: 0, rank: 7, row: 0, col: 0 });
      expect(squareToCoords("h1")).toEqual({ file: 7, rank: 0, row: 7, col: 7 });
      expect(squareToCoords("h8")).toEqual({ file: 7, rank: 7, row: 0, col: 7 });
      expect(squareToCoords("e4")).toEqual({ file: 4, rank: 3, row: 4, col: 4 });
      expect(squareToCoords("d5")).toEqual({ file: 3, rank: 4, row: 3, col: 3 });
    });

    it("handles uppercase and trimmed input strings", () => {
      expect(squareToCoords("  E4  ")).toEqual({ file: 4, rank: 3, row: 4, col: 4 });
      expect(squareToCoords("A8")).toEqual({ file: 0, rank: 7, row: 0, col: 0 });
    });

    it("clamps invalid characters or out-of-range coordinates cleanly", () => {
      // Empty input
      expect(squareToCoords("")).toEqual({ file: 0, rank: 0, row: 7, col: 0 });
      // File out of range
      expect(squareToCoords("z9")).toEqual({ file: 7, rank: 7, row: 0, col: 7 });
    });
  });

  describe("coordsToSquare", () => {
    it("converts row and column numbers to algebraic square notation", () => {
      expect(coordsToSquare(0, 0)).toBe("a8");
      expect(coordsToSquare(7, 0)).toBe("a1");
      expect(coordsToSquare(0, 7)).toBe("h8");
      expect(coordsToSquare(7, 7)).toBe("h1");
      expect(coordsToSquare(4, 4)).toBe("e4");
      expect(coordsToSquare(3, 3)).toBe("d5");
    });

    it("converts coordinate objects with row and col", () => {
      expect(coordsToSquare({ row: 0, col: 0 })).toBe("a8");
      expect(coordsToSquare({ row: 7, col: 7 })).toBe("h1");
      expect(coordsToSquare({ row: 4, col: 4 })).toBe("e4");
    });

    it("converts coordinate objects with file and rank", () => {
      expect(coordsToSquare({ file: 0, rank: 7 })).toBe("a8");
      expect(coordsToSquare({ file: 0, rank: 0 })).toBe("a1");
      expect(coordsToSquare({ file: 4, rank: 3 })).toBe("e4");
      expect(coordsToSquare({ file: 7, rank: 7 })).toBe("h8");
    });

    it("clamps out-of-range numeric coordinates", () => {
      expect(coordsToSquare(-5, -2)).toBe("a8");
      expect(coordsToSquare(99, 99)).toBe("h1");
    });

    it("handles partial coordinate objects and defaults", () => {
      expect(coordsToSquare({ file: 3 } as any)).toBe("a8");
      expect(coordsToSquare({ rank: 3 } as any)).toBe("a8");
      expect(coordsToSquare({ row: 2 } as any)).toBe("a6");
      expect(coordsToSquare({} as any)).toBe("a8");
      expect(coordsToSquare(2)).toBe("a6");
      expect(coordsToSquare(null as any)).toBe("a1");
    });
  });

  describe("Round-Trip Invariants", () => {
    it("guarantees 100% bijective round-trip fidelity for all 64 chess squares", () => {
      const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
      const ranks = ["1", "2", "3", "4", "5", "6", "7", "8"];

      for (const file of files) {
        for (const rank of ranks) {
          const sq = `${file}${rank}`;
          const coords = squareToCoords(sq);
          expect(coordsToSquare(coords.row, coords.col)).toBe(sq);
          expect(coordsToSquare(coords)).toBe(sq);
          expect(coordsToSquare({ file: coords.file, rank: coords.rank })).toBe(sq);
        }
      }
    });
  });
});
