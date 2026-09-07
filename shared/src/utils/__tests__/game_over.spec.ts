import { describe, it, expect } from "vitest";
import {
  createGameOverPayload,
  formatGameOverMessage,
  calculateMaterialAndCaptures,
} from "../game_over.js";
import { Chess } from "chess.js";

describe("GameOver Utilities (MAJ-039)", () => {
  describe("formatGameOverMessage", () => {
    it("formats checkmate messages for White and Black", () => {
      expect(formatGameOverMessage("w", "checkmate", "Alice")).toBe(
        "Checkmate! Alice won the match.",
      );
      expect(formatGameOverMessage("b", "checkmate")).toBe(
        "Checkmate! Black won the match.",
      );
    });

    it("formats resignation messages", () => {
      expect(formatGameOverMessage("w", "resignation", "Alice", "Bob")).toBe(
        "Bob resigned. Alice won the match!",
      );
    });

    it("formats abandonment messages", () => {
      expect(formatGameOverMessage("b", "abandonment", "Bob", "Alice")).toBe(
        "Alice disconnected. Bob won by abandonment!",
      );
      expect(formatGameOverMessage("draw", "abandonment")).toBe(
        "Both players disconnected. Game ended by abandonment.",
      );
    });

    it("formats draw messages", () => {
      expect(formatGameOverMessage("draw", "draw_agreement")).toBe(
        "Match concluded with a mutually agreed draw.",
      );
      expect(formatGameOverMessage("draw", "stalemate")).toBe(
        "Draw by stalemate!",
      );
      expect(formatGameOverMessage("draw", "threefold_repetition")).toBe(
        "Draw by threefold repetition!",
      );
    });
  });

  describe("createGameOverPayload", () => {
    it("builds payload with explicit duration", () => {
      const payload = createGameOverPayload({
        winner: "w",
        winnerName: "Grandmaster",
        reason: "checkmate",
        finalFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        totalMoves: 34,
        durationSeconds: 120,
      });

      expect(payload).toEqual({
        winner: "w",
        winnerName: "Grandmaster",
        reason: "checkmate",
        message: "Checkmate! Grandmaster won the match.",
        finalFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        totalMoves: 34,
        durationSeconds: 120,
      });
    });

    it("calculates duration from startTimeMs and nowMs", () => {
      const payload = createGameOverPayload({
        winner: "draw",
        reason: "stalemate",
        finalFen: "8/8/8/8/8/8/8/k6K w - - 0 1",
        totalMoves: 50,
        startTimeMs: 1000000,
        nowMs: 1045000,
      });

      expect(payload.durationSeconds).toBe(45);
      expect(payload.message).toBe("Draw by stalemate!");
    });

    it("preserves custom message when supplied", () => {
      const payload = createGameOverPayload({
        winner: "b",
        reason: "resignation",
        finalFen: "position",
        totalMoves: 10,
        message: "Special custom game over message",
      });

      expect(payload.message).toBe("Special custom game over message");
    });
  });

  describe("re-exported material evaluation", () => {
    it("exports calculateMaterialAndCaptures correctly", () => {
      const chess = new Chess();
      const result = calculateMaterialAndCaptures(chess);
      expect(result.capturedWhite).toEqual([]);
      expect(result.capturedBlack).toEqual([]);
      expect(result.materialAdvantage).toEqual({ white: 0, black: 0 });
    });
  });
});
