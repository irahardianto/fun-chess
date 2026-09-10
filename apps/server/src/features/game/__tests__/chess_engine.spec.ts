import { describe, it, expect, vi } from "vitest";
import { Chess } from "chess.js";
import type { MoveResult, Square } from "@fun-chess/shared";
import { ChessEngine } from "../chess_engine.js";

describe("ChessEngine", () => {
  it("extracts correct initial game state from a fresh chess board", () => {
    const chess = new Chess();
    const state = ChessEngine.extractGameState(chess, null);

    expect(state.turn).toBe("w");
    expect(state.isCheck).toBe(false);
    expect(state.isCheckmate).toBe(false);
    expect(state.isDraw).toBe(false);
    expect(state.capturedWhite).toEqual([]);
    expect(state.capturedBlack).toEqual([]);
    expect(state.materialAdvantage).toEqual({ white: 0, black: 0 });
    expect(state.moveCount).toBe(0);
    expect(state.lastMove).toBeNull();
  });

  describe("validateAndApplyMove", () => {
    it("applies a legal opening pawn move (e2 to e4) and records explicit timestamp (MAJ-016)", () => {
      const initialFen = new Chess().fen();
      const testTimestamp = 1700000000000;
      const outcome = ChessEngine.validateAndApplyMove(
        initialFen,
        { from: "e2", to: "e4" },
        "w",
        [],
        testTimestamp,
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.moveResult.from).toBe("e2");
        expect(outcome.moveResult.to).toBe("e4");
        expect(outcome.moveResult.san).toBe("e4");
        expect(outcome.moveResult.piece).toBe("p");
        expect(outcome.moveResult.color).toBe("w");
        expect(outcome.moveResult.timestamp).toBe(testTimestamp);
        expect(outcome.nextState.turn).toBe("b");
        expect(outcome.nextState.lastMove).toEqual({ from: "e2", to: "e4" });
        expect(outcome.nextState.moveHistory).toHaveLength(1);
      }
    });

    it("rejects a move when it is not the player turn", () => {
      const initialFen = new Chess().fen();
      const outcome = ChessEngine.validateAndApplyMove(
        initialFen,
        { from: "e7", to: "e5" },
        "b",
        [],
        1700000000000,
      );

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBe("Not your turn");
      }
    });

    it("rejects an illegal move (pawn jumping over pawn)", () => {
      const initialFen = new Chess().fen();
      const outcome = ChessEngine.validateAndApplyMove(
        initialFen,
        { from: "e2", to: "e5" },
        "w",
        [],
        1700000000000,
      );

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBeDefined();
      }
    });

    it("handles pawn promotion", () => {
      // White pawn on e7, black king on a8
      const promotionFen = "k7/4P3/8/8/8/8/8/K7 w - - 0 1";
      const outcome = ChessEngine.validateAndApplyMove(
        promotionFen,
        { from: "e7", to: "e8", promotion: "q" },
        "w",
        [],
        1700000000000,
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.moveResult.promotion).toBe("q");
        expect(outcome.moveResult.san).toContain("e8=Q");
      }
    });

    it("handles castling kingside", () => {
      const castleFen =
        "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
      const outcome = ChessEngine.validateAndApplyMove(
        castleFen,
        { from: "e1", to: "g1" },
        "w",
        [],
        1700000000000,
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.moveResult.san).toBe("O-O");
        expect(outcome.moveResult.flags).toContain("k");
      }
    });

    it("handles en passant captures", () => {
      // White pawn on e5, Black pawn just played d7-d5
      const enPassantFen =
        "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3";
      const outcome = ChessEngine.validateAndApplyMove(
        enPassantFen,
        { from: "e5", to: "d6" },
        "w",
        [],
        1700000000000,
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.moveResult.captured).toBe("p");
        expect(outcome.moveResult.flags).toContain("e");
        expect(outcome.nextState.capturedBlack).toContain("p");
      }
    });
  });

  describe("Check and Checkmate Detection", () => {
    it("detects check and locates king square", () => {
      // White queen on e7 checking black king on e8
      const checkFen =
        "rnbqkbnr/ppppQppp/8/8/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3";
      const chess = new Chess(checkFen);
      const state = ChessEngine.extractGameState(chess, {
        from: "h4",
        to: "e7",
      });

      expect(state.isCheck).toBe(true);
      expect(state.isCheckmate).toBe(false);

      const kingSquare = ChessEngine.getKingSquare(chess, "b");
      expect(kingSquare).toBe("e8");
    });

    it("detects Scholar Checkmate (Fool/Scholar Mate)", () => {
      // 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
      const mateFen =
        "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";
      const chess = new Chess(mateFen);
      const state = ChessEngine.extractGameState(chess, {
        from: "c4",
        to: "f7",
      });

      expect(state.isCheck).toBe(true);
      expect(state.isCheckmate).toBe(true);
      expect(state.isDraw).toBe(false);
    });
  });

  describe("Draw and Material Calculations", () => {
    it("detects insufficient material (King vs King)", () => {
      const bareKingsFen = "8/8/8/4k3/8/8/4K3/8 w - - 0 1";
      const chess = new Chess(bareKingsFen);
      const state = ChessEngine.extractGameState(chess, null);

      expect(state.isInsufficientMaterial).toBe(true);
      expect(state.isDraw).toBe(true);
    });

    it("detects stalemate", () => {
      // Black king on a8, white queen on c7, white king on a6
      const stalemateFen = "k7/2Q5/K7/8/8/8/8/8 b - - 0 1";
      const chess = new Chess(stalemateFen);
      const state = ChessEngine.extractGameState(chess, null);

      expect(state.isCheck).toBe(false);
      expect(state.isCheckmate).toBe(false);
      expect(state.isStalemate).toBe(true);
      expect(state.isDraw).toBe(true);
    });

    it("calculates captured pieces and material advantage accurately", () => {
      // White is missing 1 Queen and 1 Pawn, Black is missing 1 Knight
      // White has: 7 pawns, 2 knights, 2 bishops, 2 rooks, 0 queens (mat = 7 + 6 + 6 + 10 + 0 = 29)
      // Black has: 8 pawns, 1 knight, 2 bishops, 2 rooks, 1 queen (mat = 8 + 3 + 6 + 10 + 9 = 36)
      // Net: Black +7 advantage
      const testFen =
        "r1bqk2r/pppppppp/2n5/8/8/8/PPPPPPP1/RNB1KBNR w KQkq - 0 1";
      const chess = new Chess(testFen);
      const { capturedWhite, capturedBlack, materialAdvantage } =
        ChessEngine.calculateMaterialAndCaptures(chess);

      expect(capturedWhite).toContain("q");
      expect(capturedWhite).toContain("p");
      expect(capturedBlack).toContain("n");
      expect(materialAdvantage.black).toBeGreaterThan(0);
      expect(materialAdvantage.white).toBe(0);
    });
  });

  describe("Threefold Repetition Detection", () => {
    it("correctly normalizes FEN strings to first 4 tokens", () => {
      const fullFen =
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
      const normalized = ChessEngine.normalizeFen(fullFen);
      expect(normalized).toBe(
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3",
      );
    });

    it("detects threefold repetition when moves cycle back to initial position 3 times", () => {
      // Sequence: 1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8
      const moves: { from: string; to: string; turn: "w" | "b" }[] = [
        { from: "g1", to: "f3", turn: "w" },
        { from: "g8", to: "f6", turn: "b" },
        { from: "f3", to: "g1", turn: "w" },
        { from: "f6", to: "g8", turn: "b" }, // Position occurs 2nd time
        { from: "g1", to: "f3", turn: "w" },
        { from: "g8", to: "f6", turn: "b" },
        { from: "f3", to: "g1", turn: "w" },
        { from: "f6", to: "g8", turn: "b" }, // Position occurs 3rd time -> threefold repetition
      ];

      let currentFen = new Chess().fen();
      let history: MoveResult[] = [];

      for (let i = 0; i < moves.length; i++) {
        const m = moves[i]!;
        const outcome = ChessEngine.validateAndApplyMove(
          currentFen,
          { from: m.from, to: m.to },
          m.turn,
          history,
          1700000000000 + i * 1000,
        );

        expect(outcome.success).toBe(true);
        if (!outcome.success) return;

        currentFen = outcome.nextState.fen;
        history = outcome.nextState.moveHistory;

        if (i < moves.length - 1) {
          expect(outcome.nextState.isDraw).toBe(false);
          expect(outcome.nextState.isThreefoldRepetition).toBe(false);
        } else {
          // 8th ply: 3rd occurrence of starting position
          expect(outcome.nextState.isThreefoldRepetition).toBe(true);
          expect(outcome.nextState.isDraw).toBe(true);
        }
      }
    });

    it("detects threefold repetition for non-start intermediate positions", () => {
      // 1. e4 e5 (new base position)
      // 2. Nf3 Nf6 3. Ng1 Ng8 4. Nf3 Nf6 5. Ng1 Ng8
      const moves: { from: string; to: string; turn: "w" | "b" }[] = [
        { from: "e2", to: "e4", turn: "w" },
        { from: "e7", to: "e5", turn: "b" }, // Base position reached (1st occurrence)
        { from: "g1", to: "f3", turn: "w" },
        { from: "g8", to: "f6", turn: "b" },
        { from: "f3", to: "g1", turn: "w" },
        { from: "f6", to: "g8", turn: "b" }, // Base position reached (2nd occurrence)
        { from: "g1", to: "f3", turn: "w" },
        { from: "g8", to: "f6", turn: "b" },
        { from: "f3", to: "g1", turn: "w" },
        { from: "f6", to: "g8", turn: "b" }, // Base position reached (3rd occurrence)
      ];

      let currentFen = new Chess().fen();
      let history: MoveResult[] = [];

      for (let i = 0; i < moves.length; i++) {
        const m = moves[i]!;
        const outcome = ChessEngine.validateAndApplyMove(
          currentFen,
          { from: m.from, to: m.to },
          m.turn,
          history,
          1700000000000 + i * 1000,
        );

        expect(outcome.success).toBe(true);
        if (!outcome.success) return;

        currentFen = outcome.nextState.fen;
        history = outcome.nextState.moveHistory;

        if (i < moves.length - 1) {
          expect(outcome.nextState.isDraw).toBe(false);
          expect(outcome.nextState.isThreefoldRepetition).toBe(false);
        } else {
          expect(outcome.nextState.isThreefoldRepetition).toBe(true);
          expect(outcome.nextState.isDraw).toBe(true);
        }
      }
    });
  });

  describe("validateMove (MIN-026)", () => {
    it("validates a legal move and returns hydrated Chess instance and Move object", () => {
      const initialFen = new Chess().fen();
      const result = ChessEngine.validateMove(
        initialFen,
        { from: "e2", to: "e4" },
        "w",
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.chess).toBeInstanceOf(Chess);
        expect(result.chess.fen()).toContain(
          "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -",
        );
        expect(result.moveResultObj).toBeDefined();
        expect(result.moveResultObj.from).toBe("e2");
        expect(result.moveResultObj.to).toBe("e4");
        expect(result.moveResultObj.san).toBe("e4");
        expect(result.moveResultObj.color).toBe("w");
        expect(result.moveResultObj.piece).toBe("p");
      }
    });

    it("rejects move when turn does not match expectedTurn", () => {
      const initialFen = new Chess().fen();
      const result = ChessEngine.validateMove(
        initialFen,
        { from: "e7", to: "e5" },
        "b",
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Not your turn");
      }
    });

    it("rejects an illegal move for valid turn", () => {
      const initialFen = new Chess().fen();
      const result = ChessEngine.validateMove(
        initialFen,
        { from: "e2", to: "e5" },
        "w",
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid move");
      }
    });

    it("returns error on malformed FEN string", () => {
      const result = ChessEngine.validateMove(
        "totally-invalid-fen-string",
        { from: "e2", to: "e4" },
        "w",
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid board FEN string");
      }
    });

    it("returns error on invalid square coordinates", () => {
      const initialFen = new Chess().fen();
      const result = ChessEngine.validateMove(
        initialFen,
        { from: "z9" as unknown as Square, to: "e4" },
        "w",
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("applyMove (MIN-026)", () => {
    it("transforms chess.js move output into GameState and MoveResult with history", () => {
      const chess = new Chess();
      const moveObj = chess.move({ from: "e2", to: "e4" });
      expect(moveObj).toBeDefined();

      const fixedTimestamp = 1750000000000;
      const { nextState, moveResult } = ChessEngine.applyMove(
        chess,
        moveObj!,
        [],
        fixedTimestamp,
      );

      expect(moveResult.from).toBe("e2");
      expect(moveResult.to).toBe("e4");
      expect(moveResult.san).toBe("e4");
      expect(moveResult.color).toBe("w");
      expect(moveResult.piece).toBe("p");
      expect(moveResult.moveNumber).toBe(1);
      expect(moveResult.timestamp).toBe(fixedTimestamp);

      expect(nextState.turn).toBe("b");
      expect(nextState.lastMove).toEqual({ from: "e2", to: "e4" });
      expect(nextState.moveCount).toBe(1);
      expect(nextState.moveHistory).toHaveLength(1);
      expect(nextState.moveHistory[0]).toEqual(moveResult);
    });

    it("correctly handles captures and pawn promotions in applyMove", () => {
      // White pawn on e7 captures black rook on d8 promoting to queen
      const promoCaptureFen = "3r4/4P3/8/8/8/8/8/K6k w - - 0 1";
      const chess = new Chess(promoCaptureFen);
      const moveObj = chess.move({ from: "e7", to: "d8", promotion: "q" });
      expect(moveObj).toBeDefined();

      const fixedTimestamp = 1750000000000;
      const { nextState, moveResult } = ChessEngine.applyMove(
        chess,
        moveObj!,
        [],
        fixedTimestamp,
      );

      expect(moveResult.timestamp).toBe(fixedTimestamp);
      expect(moveResult.captured).toBe("r");
      expect(moveResult.promotion).toBe("q");
      expect(moveResult.san).toContain("exd8=Q");
      expect(nextState.capturedWhite).toContain("r");
    });
  });

  describe("Stalemate, Insufficient Material, and 50-Move Rule (MAJ-033)", () => {
    it("detects stalemate and extracts GameState correctly", () => {
      // Black king on a8, White queen on b1, White king on a6 (Black is stalemated)
      const stalemateFen = "k7/8/K7/8/8/8/8/1Q6 b - - 1 1";
      const chess = new Chess(stalemateFen);
      const state = ChessEngine.extractGameState(chess, {
        from: "b6",
        to: "a6",
      });

      expect(state.isStalemate).toBe(true);
      expect(state.isDraw).toBe(true);
      expect(state.isCheck).toBe(false);
      expect(state.isCheckmate).toBe(false);
    });

    it("applies move resulting in stalemate through validateAndApplyMove", () => {
      // White king on b6, Queen on b1, Black king on a8 -> White plays Ka6 causing stalemate
      const preStalemateFen = "k7/8/1K6/8/8/8/8/1Q6 w - - 0 1";
      const outcome = ChessEngine.validateAndApplyMove(
        preStalemateFen,
        { from: "b6", to: "a6" },
        "w",
        [],
        1700000000000,
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.nextState.isStalemate).toBe(true);
        expect(outcome.nextState.isDraw).toBe(true);
        expect(outcome.nextState.isCheck).toBe(false);
        expect(outcome.nextState.isCheckmate).toBe(false);
      }
    });

    it("detects insufficient material for King and Bishop vs King", () => {
      const bishopOnlyFen = "8/8/3k4/8/3KB3/8/8/8 b - - 0 1";
      const chess = new Chess(bishopOnlyFen);
      const state = ChessEngine.extractGameState(chess, null);

      expect(state.isInsufficientMaterial).toBe(true);
      expect(state.isDraw).toBe(true);
    });

    it("detects insufficient material for King and Knight vs King", () => {
      const knightOnlyFen = "8/8/3k4/8/3KN3/8/8/8 b - - 0 1";
      const chess = new Chess(knightOnlyFen);
      const state = ChessEngine.extractGameState(chess, null);

      expect(state.isInsufficientMaterial).toBe(true);
      expect(state.isDraw).toBe(true);
    });

    it("applies capture that reduces board to insufficient material", () => {
      // White bishop captures black's last pawn on d5 leaving King+Bishop vs King
      const preInsufficientFen = "8/8/3k4/3p4/3KB3/8/8/8 w - - 0 1";
      const outcome = ChessEngine.validateAndApplyMove(
        preInsufficientFen,
        { from: "e4", to: "d5" },
        "w",
        [],
        1700000000000,
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.nextState.isInsufficientMaterial).toBe(true);
        expect(outcome.nextState.isDraw).toBe(true);
        expect(outcome.moveResult.captured).toBe("p");
      }
    });

    it("detects 50-move rule from FEN halfmove clock at 100", () => {
      // Halfmove clock token is 100 with material remaining on board
      const fiftyMoveFen = "r6k/7p/8/8/8/8/P7/R5K1 b - - 100 50";
      const chess = new Chess(fiftyMoveFen);
      const state = ChessEngine.extractGameState(chess, null);

      expect(state.isFiftyMoveRule).toBe(true);
      expect(state.isDraw).toBe(true);
      expect(state.isInsufficientMaterial).toBe(false);
      expect(state.isStalemate).toBe(false);
    });

    it("applies move that reaches 100 halfmove clock triggering 50-move rule draw", () => {
      // Move 50: halfmove clock at 99, White plays non-pawn, non-capturing move Kg1 (h1 to g1)
      const preFiftyMoveFen = "r6k/7p/8/8/8/8/P7/R6K w - - 99 50";
      const outcome = ChessEngine.validateAndApplyMove(
        preFiftyMoveFen,
        { from: "h1", to: "g1" },
        "w",
        [],
        1700000000000,
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.nextState.isFiftyMoveRule).toBe(true);
        expect(outcome.nextState.isDraw).toBe(true);
        expect(outcome.nextState.isInsufficientMaterial).toBe(false);
        expect(outcome.nextState.isStalemate).toBe(false);
      }
    });
  });

  describe("Pure Engine & Purity Invariants (MAJ-013)", () => {
    it("returns pure outcome object without side effects on invalid FEN", () => {
      const outcome = ChessEngine.validateMove(
        "totally-invalid-fen-string",
        { from: "e2", to: "e4" },
        "w",
      );

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBe("Invalid board FEN string");
      }
    });

    it("returns pure failure outcome on validateAndApplyMove with invalid FEN", () => {
      const outcome = ChessEngine.validateAndApplyMove(
        "invalid-fen",
        { from: "e2", to: "e4" },
        "w",
        [],
        Date.now(),
      );

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBe("Invalid board FEN string");
      }
    });
  });

  describe("King Square Coordinates Delegation (MIN-019)", () => {
    it("locates white king at e1 and black king at e8 on starting board", () => {
      const chess = new Chess();
      expect(ChessEngine.getKingSquare(chess, "w")).toBe("e1");
      expect(ChessEngine.getKingSquare(chess, "b")).toBe("e8");
    });

    it("locates kings after moves", () => {
      const fen = "8/8/4k3/8/8/4K3/8/8 w - - 0 1";
      const chess = new Chess(fen);
      expect(ChessEngine.getKingSquare(chess, "w")).toBe("e3");
      expect(ChessEngine.getKingSquare(chess, "b")).toBe("e6");
    });

    it("returns null when king is absent", () => {
      const chess = new Chess();
      const customBoard = chess
        .board()
        .map((row) =>
          row.map((piece) =>
            piece?.type === "k" && piece.color === "b" ? null : piece,
          ),
        );
      vi.spyOn(chess, "board").mockReturnValue(customBoard);
      expect(ChessEngine.getKingSquare(chess, "w")).toBe("e1");
      expect(ChessEngine.getKingSquare(chess, "b")).toBeNull();
    });

    it("finds king square from FEN using findKingSquare", () => {
      const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      expect(ChessEngine.findKingSquare(fen, "w")).toBe("e1");
      expect(ChessEngine.findKingSquare(fen, "b")).toBe("e8");

      expect(ChessEngine.findKingSquare("invalid-fen", "w")).toBeNull();
    });

    it("returns pure validation failure outcome without side effects when validateMove catches errors", () => {
      const outcome = ChessEngine.validateMove(
        "invalid-fen-string",
        { from: "e2", to: "e4" },
        "w",
      );

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBe("Invalid board FEN string");
      }
    });
  });
});
