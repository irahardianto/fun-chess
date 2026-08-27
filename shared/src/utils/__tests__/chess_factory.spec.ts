import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Chess } from "chess.js";
import {
  DEFAULT_CHESS_FEN,
  isValidFen,
  createSafeChess,
  safeLoadFen,
} from "../chess_factory.js";

describe("Safe Chess Factory & FEN Validator", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("DEFAULT_CHESS_FEN constant", () => {
    it("matches standard initial chess position", () => {
      expect(DEFAULT_CHESS_FEN).toBe(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      );
    });
  });

  describe("isValidFen()", () => {
    it("returns true for standard starting position FEN", () => {
      expect(isValidFen(DEFAULT_CHESS_FEN)).toBe(true);
    });

    it("returns true for valid mid-game and endgame FEN positions", () => {
      // Scholar's mate position
      const scholarsMate =
        "r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
      expect(isValidFen(scholarsMate)).toBe(true);

      // Endgame position with kings and pawns
      const endgame = "8/5k2/8/8/8/8/4K3/8 w - - 0 1";
      expect(isValidFen(endgame)).toBe(true);

      // En-passant available FEN
      const enPassant =
        "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2";
      expect(isValidFen(enPassant)).toBe(true);
    });

    it("returns false for undefined, null, empty string, and non-string inputs", () => {
      expect(isValidFen(undefined)).toBe(false);
      expect(isValidFen(null)).toBe(false);
      expect(isValidFen("")).toBe(false);
      expect(isValidFen("   ")).toBe(false);
      expect(isValidFen(12345)).toBe(false);
      expect(isValidFen({})).toBe(false);
      expect(isValidFen([])).toBe(false);
      expect(isValidFen(true)).toBe(false);
    });

    it("returns false for corrupted or illegal FEN strings", () => {
      // Missing kings
      expect(isValidFen("8/8/8/8/8/8/8/8 w - - 0 1")).toBe(false);

      // Illegal piece characters
      expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w KQkq - 0 1")).toBe(false);

      // Too few ranks
      expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1")).toBe(false);

      // Invalid active turn indicator
      expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1")).toBe(false);

      // Random garbage text
      expect(isValidFen("not-a-valid-fen-at-all")).toBe(false);
    });
  });

  describe("createSafeChess()", () => {
    it("creates a Chess instance with standard starting position when called with no arguments", () => {
      const chess = createSafeChess();
      expect(chess).toBeInstanceOf(Chess);
      expect(chess.fen()).toBe(DEFAULT_CHESS_FEN);
      expect(chess.turn()).toBe("w");
      expect(chess.history()).toHaveLength(0);
    });

    it("creates a Chess instance with standard starting position when called with undefined, empty string, or whitespace", () => {
      expect(createSafeChess(undefined).fen()).toBe(DEFAULT_CHESS_FEN);
      expect(createSafeChess("").fen()).toBe(DEFAULT_CHESS_FEN);
      expect(createSafeChess("   ").fen()).toBe(DEFAULT_CHESS_FEN);
    });

    it("successfully loads a valid custom FEN", () => {
      const customFen =
        "r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
      const chess = createSafeChess(customFen);
      expect(chess).toBeInstanceOf(Chess);
      expect(chess.fen()).toBe(customFen);
      expect(chess.turn()).toBe("w");
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("safely falls back to default starting position when passed an invalid FEN without throwing", () => {
      const invalidFens = [
        "invalid-fen-string",
        "8/8/8/8/8/8/8/8 w - - 0 1", // no kings
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR z KQkq - 0 1", // invalid turn
        "rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // rank width > 8
      ];

      for (const badFen of invalidFens) {
        const chess = createSafeChess(badFen);
        expect(chess).toBeInstanceOf(Chess);
        expect(chess.fen()).toBe(DEFAULT_CHESS_FEN);
        expect(chess.turn()).toBe("w");
      }

      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe("safeLoadFen()", () => {
    it("loads a valid FEN into an existing Chess instance and returns true", () => {
      const chess = new Chess();
      const validPosition =
        "r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4";

      const result = safeLoadFen(chess, validPosition);
      expect(result).toBe(true);
      expect(chess.fen()).toBe(validPosition);
    });

    it("rejects an invalid FEN, returns false without throwing, and preserves previous position", () => {
      const chess = new Chess();
      const initialFen = chess.fen();

      const result = safeLoadFen(chess, "corrupted-fen-text");
      expect(result).toBe(false);
      expect(chess.fen()).toBe(initialFen);
    });

    it("returns false gracefully if chess instance is null or undefined", () => {
      expect(safeLoadFen(null as unknown as Chess, DEFAULT_CHESS_FEN)).toBe(false);
    });
  });
});
