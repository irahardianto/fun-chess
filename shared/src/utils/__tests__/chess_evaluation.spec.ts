import { describe, it, expect, vi } from "vitest";
import { Chess } from "chess.js";
import {
  calculateMaterialAndCaptures,
  calculateBoardMaterial,
  calculateMaterialDifference,
  calculateCaptures,
  getKingSquare,
  isPawnPromotion,
  createInitialGameState,
  STANDARD_PIECE_POINTS,
} from "../chess_evaluation.js";
import { DEFAULT_CHESS_FEN } from "../chess_factory.js";

describe("chess_evaluation utils", () => {
  describe("STANDARD_PIECE_POINTS", () => {
    it("exports standard chess piece point values: { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }", () => {
      expect(STANDARD_PIECE_POINTS).toEqual({
        p: 1,
        n: 3,
        b: 3,
        r: 5,
        q: 9,
        k: 0,
      });
    });
  });

  describe("calculateBoardMaterial (MIN-018)", () => {
    it("returns correct piece counts and material values for standard starting position", () => {
      const chess = new Chess();
      const summary = calculateBoardMaterial(chess);

      expect(summary.whiteCounts).toEqual({
        p: 8,
        n: 2,
        b: 2,
        r: 2,
        q: 1,
        k: 1,
      });
      expect(summary.blackCounts).toEqual({
        p: 8,
        n: 2,
        b: 2,
        r: 2,
        q: 1,
        k: 1,
      });
      expect(summary.whiteMaterial).toBe(39);
      expect(summary.blackMaterial).toBe(39);
    });

    it("correctly counts pieces and material for custom position with missing pieces", () => {
      // Black missing queen (9) and knight (3)
      const fen = "r1b1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const chess = new Chess(fen);
      const summary = calculateBoardMaterial(chess);

      expect(summary.blackCounts.q).toBe(0);
      expect(summary.blackCounts.n).toBe(1);
      expect(summary.blackMaterial).toBe(27);
      expect(summary.whiteMaterial).toBe(39);
    });
  });

  describe("calculateMaterialDifference (MIN-016)", () => {
    it("returns zero advantage for equal starting position", () => {
      const chess = new Chess();
      const diff = calculateMaterialDifference(chess);
      expect(diff).toEqual({ white: 0, black: 0 });
    });

    it("calculates white advantage when black is down material", () => {
      const fen = "r1b1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const chess = new Chess(fen);
      const diff = calculateMaterialDifference(chess);
      expect(diff).toEqual({ white: 12, black: 0 });
    });

    it("accepts a precomputed BoardMaterialSummary", () => {
      const chess = new Chess("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1");
      const summary = calculateBoardMaterial(chess);
      const diff = calculateMaterialDifference(summary);
      expect(diff).toEqual({ white: 0, black: 9 });
    });
  });

  describe("calculateCaptures (MIN-016)", () => {
    it("returns empty lists for starting position", () => {
      const chess = new Chess();
      const captures = calculateCaptures(chess);
      expect(captures.capturedWhite).toEqual([]);
      expect(captures.capturedBlack).toEqual([]);
    });

    it("returns ordered captured pieces for positions with missing pieces", () => {
      // Black missing 1 rook, White missing 1 rook
      const fen = "1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1";
      const chess = new Chess(fen);
      const captures = calculateCaptures(chess);

      expect(captures.capturedWhite).toEqual(["r"]);
      expect(captures.capturedBlack).toEqual(["r"]);
    });

    it("accepts a precomputed BoardMaterialSummary", () => {
      const fen = "r1b1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const chess = new Chess(fen);
      const summary = calculateBoardMaterial(chess);
      const captures = calculateCaptures(summary);

      expect(captures.capturedBlack).toEqual(["q", "n"]);
      expect(captures.capturedWhite).toEqual([]);
    });
  });

  describe("calculateMaterialAndCaptures", () => {
    it("returns empty captures and zero material advantage for starting position", () => {
      const chess = new Chess();
      const result = calculateMaterialAndCaptures(chess);

      expect(result.capturedWhite).toEqual([]);
      expect(result.capturedBlack).toEqual([]);
      expect(result.materialAdvantage).toEqual({ white: 0, black: 0 });
    });

    it("detects captured material when White loses a queen (Black advantage 9)", () => {
      // Position where White is missing the queen:
      // Starting position without White's queen at d1
      const fenWithoutWhiteQueen =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";
      const chess = new Chess(fenWithoutWhiteQueen);
      const result = calculateMaterialAndCaptures(chess);

      expect(result.capturedWhite).toContain("q");
      expect(result.capturedWhite).toEqual(["q"]);
      expect(result.capturedBlack).toEqual([]);
      expect(result.materialAdvantage).toEqual({ white: 0, black: 9 });
    });

    it("detects captured material when Black loses multiple pieces (White advantage)", () => {
      // Position where Black is missing queen (d8) and a knight (b8):
      // White has full starting material (39), Black has 39 - 9 - 3 = 27
      const fenWithoutBlackQueenAndKnight =
        "r1b1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      const chess = new Chess(fenWithoutBlackQueenAndKnight);
      const result = calculateMaterialAndCaptures(chess);

      expect(result.capturedBlack).toContain("q");
      expect(result.capturedBlack).toContain("n");
      expect(result.capturedWhite).toEqual([]);
      expect(result.materialAdvantage).toEqual({ white: 12, black: 0 });
    });

    it("handles positions where both sides have captured pieces", () => {
      // White missing 1 rook (5), Black missing 1 bishop (3) -> White advantage 0, Black advantage 2
      const fenBothCaptured =
        "rnbqk1nr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1";
      const chess = new Chess(fenBothCaptured);
      const result = calculateMaterialAndCaptures(chess);

      expect(result.capturedWhite).toEqual(["r"]);
      expect(result.capturedBlack).toEqual(["b"]);
      expect(result.materialAdvantage).toEqual({ white: 0, black: 2 });
    });
  });

  describe("isPawnPromotion", () => {
    it("returns true when a white pawn moves to rank 8", () => {
      // Using piece object
      expect(
        isPawnPromotion("e7", "e8", { type: "p", color: "w" }),
      ).toBe(true);

      // Using Chess instance with white pawn on 7th rank
      const chess = new Chess("4k3/4P3/8/8/8/8/8/4K3 w - - 0 1");
      expect(isPawnPromotion("e7", "e8", chess)).toBe(true);
    });

    it("returns true when a black pawn moves to rank 1", () => {
      // Using piece object
      expect(
        isPawnPromotion("d2", "d1", { type: "p", color: "b" }),
      ).toBe(true);

      // Using Chess instance with black pawn on 2nd rank
      const chess = new Chess("4k3/8/8/8/8/8/4p3/4K3 b - - 0 1");
      expect(isPawnPromotion("e2", "e1", chess)).toBe(true);
    });

    it("returns false when a non-pawn piece moves to rank 8 or rank 1", () => {
      const nonPawns = ["q", "r", "b", "n", "k"];
      for (const type of nonPawns) {
        expect(
          isPawnPromotion("e7", "e8", { type, color: "w" }),
        ).toBe(false);
        expect(
          isPawnPromotion("e2", "e1", { type, color: "b" }),
        ).toBe(false);
      }

      // Using Chess instance with a white queen moving to rank 8
      const chess = new Chess("4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1");
      expect(isPawnPromotion("e7", "e8", chess)).toBe(false);
    });

    it("returns false when a pawn moves to rank 7 or rank 2", () => {
      // White pawn moving to rank 7
      expect(
        isPawnPromotion("e6", "e7", { type: "p", color: "w" }),
      ).toBe(false);

      // Black pawn moving to rank 2
      expect(
        isPawnPromotion("e3", "e2", { type: "p", color: "b" }),
      ).toBe(false);

      // White pawn moving to rank 1 (not possible in chess, but rank is wrong for white promotion)
      expect(
        isPawnPromotion("e2", "e1", { type: "p", color: "w" }),
      ).toBe(false);

      // Black pawn moving to rank 8 (wrong rank for black promotion)
      expect(
        isPawnPromotion("e7", "e8", { type: "p", color: "b" }),
      ).toBe(false);
    });

    it("returns false for invalid inputs or empty squares", () => {
      expect(isPawnPromotion("", "")).toBe(false);
      expect(isPawnPromotion("e7", "e")).toBe(false);
      expect(isPawnPromotion("e7", "e8", null)).toBe(false);
      expect(isPawnPromotion("e7", "e8", undefined)).toBe(false);

      const chess = new Chess();
      // e4 is empty in starting position
      expect(isPawnPromotion("e4", "e5", chess)).toBe(false);
    });
  });

  describe("createInitialGameState", () => {
    it("constructs standard starting state with correct defaults", () => {
      const state = createInitialGameState();

      expect(state.fen).toBe(DEFAULT_CHESS_FEN);
      expect(state.turn).toBe("w");
      expect(state.moveCount).toBe(0);
      expect(state.isCheck).toBe(false);
      expect(state.isCheckmate).toBe(false);
      expect(state.isDraw).toBe(false);
      expect(state.isStalemate).toBe(false);
      expect(state.isThreefoldRepetition).toBe(false);
      expect(state.isInsufficientMaterial).toBe(false);
      expect(state.isFiftyMoveRule).toBe(false);
      expect(state.moveHistory).toEqual([]);
      expect(state.capturedWhite).toEqual([]);
      expect(state.capturedBlack).toEqual([]);
      expect(state.materialAdvantage).toEqual({ white: 0, black: 0 });
      expect(state.lastMove).toBeNull();
    });

    it("correctly evaluates custom FEN position with checkmate", () => {
      // Scholar's Mate checkmate position: Black is checkmated
      const scholarsMateCheckmate =
        "r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";
      const state = createInitialGameState(scholarsMateCheckmate);

      expect(state.fen).toBe(scholarsMateCheckmate);
      expect(state.turn).toBe("b");
      expect(state.isCheck).toBe(true);
      expect(state.isCheckmate).toBe(true);
      expect(state.moveCount).toBe(0);
    });

    it("correctly evaluates custom FEN position with material advantage", () => {
      const fenWithoutWhiteQueen =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";
      const state = createInitialGameState(fenWithoutWhiteQueen);

      expect(state.capturedWhite).toEqual(["q"]);
      expect(state.materialAdvantage).toEqual({ white: 0, black: 9 });
      expect(state.isCheckmate).toBe(false);
      expect(state.isCheck).toBe(false);
    });
  });

  describe("getKingSquare (MIN-019)", () => {
    it("finds white and black king squares in standard starting position", () => {
      const chess = new Chess();
      expect(getKingSquare(chess, "w")).toBe("e1");
      expect(getKingSquare(chess, "b")).toBe("e8");
    });

    it("finds king coordinates in custom board positions", () => {
      const chess = new Chess("8/8/8/4K3/8/8/4k3/8 w - - 0 1");
      expect(getKingSquare(chess, "w")).toBe("e5");
      expect(getKingSquare(chess, "b")).toBe("e2");
    });

    it("returns null if king of specified color is not on the board", () => {
      const chess = new Chess();
      const customBoard = chess.board().map((row) =>
        row.map((piece) => (piece?.type === "k" && piece.color === "b" ? null : piece)),
      );
      vi.spyOn(chess, "board").mockReturnValue(customBoard);
      expect(getKingSquare(chess, "w")).toBe("e1");
      expect(getKingSquare(chess, "b")).toBeNull();
    });
  });
});
