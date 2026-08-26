import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { ChessEngine } from '../chess_engine.js';

describe('ChessEngine', () => {
  it('extracts correct initial game state from a fresh chess board', () => {
    const chess = new Chess();
    const state = ChessEngine.extractGameState(chess, null);

    expect(state.turn).toBe('w');
    expect(state.isCheck).toBe(false);
    expect(state.isCheckmate).toBe(false);
    expect(state.isDraw).toBe(false);
    expect(state.capturedWhite).toEqual([]);
    expect(state.capturedBlack).toEqual([]);
    expect(state.materialAdvantage).toEqual({ white: 0, black: 0 });
    expect(state.moveCount).toBe(0);
    expect(state.lastMove).toBeNull();
  });

  describe('validateAndApplyMove', () => {
    it('applies a legal opening pawn move (e2 to e4)', () => {
      const initialFen = new Chess().fen();
      const outcome = ChessEngine.validateAndApplyMove(initialFen, { from: 'e2', to: 'e4' }, 'w');

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.moveResult.from).toBe('e2');
        expect(outcome.moveResult.to).toBe('e4');
        expect(outcome.moveResult.san).toBe('e4');
        expect(outcome.moveResult.piece).toBe('p');
        expect(outcome.moveResult.color).toBe('w');
        expect(outcome.nextState.turn).toBe('b');
        expect(outcome.nextState.lastMove).toEqual({ from: 'e2', to: 'e4' });
        expect(outcome.nextState.moveHistory).toHaveLength(1);
      }
    });

    it('rejects a move when it is not the player turn', () => {
      const initialFen = new Chess().fen();
      const outcome = ChessEngine.validateAndApplyMove(initialFen, { from: 'e7', to: 'e5' }, 'b');

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBe('Not your turn');
      }
    });

    it('rejects an illegal move (pawn jumping over pawn)', () => {
      const initialFen = new Chess().fen();
      const outcome = ChessEngine.validateAndApplyMove(initialFen, { from: 'e2', to: 'e5' }, 'w');

      expect(outcome.success).toBe(false);
      if (!outcome.success) {
        expect(outcome.error).toBeDefined();
      }
    });

    it('handles pawn promotion', () => {
      // White pawn on e7, black king on a8
      const promotionFen = 'k7/4P3/8/8/8/8/8/K7 w - - 0 1';
      const outcome = ChessEngine.validateAndApplyMove(
        promotionFen,
        { from: 'e7', to: 'e8', promotion: 'q' },
        'w'
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.moveResult.promotion).toBe('q');
        expect(outcome.moveResult.san).toContain('e8=Q');
      }
    });

    it('handles castling kingside', () => {
      const castleFen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
      const outcome = ChessEngine.validateAndApplyMove(
        castleFen,
        { from: 'e1', to: 'g1' },
        'w'
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.moveResult.san).toBe('O-O');
        expect(outcome.moveResult.flags).toContain('k');
      }
    });

    it('handles en passant captures', () => {
      // White pawn on e5, Black pawn just played d7-d5
      const enPassantFen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
      const outcome = ChessEngine.validateAndApplyMove(
        enPassantFen,
        { from: 'e5', to: 'd6' },
        'w'
      );

      expect(outcome.success).toBe(true);
      if (outcome.success) {
        expect(outcome.moveResult.captured).toBe('p');
        expect(outcome.moveResult.flags).toContain('e');
        expect(outcome.nextState.capturedBlack).toContain('p');
      }
    });
  });

  describe('Check and Checkmate Detection', () => {
    it('detects check and locates king square', () => {
      // White queen on e7 checking black king on e8
      const checkFen = 'rnbqkbnr/ppppQppp/8/8/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3';
      const chess = new Chess(checkFen);
      const state = ChessEngine.extractGameState(chess, { from: 'h4', to: 'e7' });

      expect(state.isCheck).toBe(true);
      expect(state.isCheckmate).toBe(false);

      const kingSquare = ChessEngine.getKingSquare(chess, 'b');
      expect(kingSquare).toBe('e8');
    });

    it('detects Scholar Checkmate (Fool/Scholar Mate)', () => {
      // 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
      const mateFen = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
      const chess = new Chess(mateFen);
      const state = ChessEngine.extractGameState(chess, { from: 'c4', to: 'f7' });

      expect(state.isCheck).toBe(true);
      expect(state.isCheckmate).toBe(true);
      expect(state.isDraw).toBe(false);
    });
  });

  describe('Draw and Material Calculations', () => {
    it('detects insufficient material (King vs King)', () => {
      const bareKingsFen = '8/8/8/4k3/8/8/4K3/8 w - - 0 1';
      const chess = new Chess(bareKingsFen);
      const state = ChessEngine.extractGameState(chess, null);

      expect(state.isInsufficientMaterial).toBe(true);
      expect(state.isDraw).toBe(true);
    });

    it('detects stalemate', () => {
      // Black king on a8, white queen on c7, white king on a6
      const stalemateFen = 'k7/2Q5/K7/8/8/8/8/8 b - - 0 1';
      const chess = new Chess(stalemateFen);
      const state = ChessEngine.extractGameState(chess, null);

      expect(state.isCheck).toBe(false);
      expect(state.isCheckmate).toBe(false);
      expect(state.isStalemate).toBe(true);
      expect(state.isDraw).toBe(true);
    });

    it('calculates captured pieces and material advantage accurately', () => {
      // White is missing 1 Queen and 1 Pawn, Black is missing 1 Knight
      // White has: 7 pawns, 2 knights, 2 bishops, 2 rooks, 0 queens (mat = 7 + 6 + 6 + 10 + 0 = 29)
      // Black has: 8 pawns, 1 knight, 2 bishops, 2 rooks, 1 queen (mat = 8 + 3 + 6 + 10 + 9 = 36)
      // Net: Black +7 advantage
      const testFen = 'r1bqk2r/pppppppp/2n5/8/8/8/PPPPPPP1/RNB1KBNR w KQkq - 0 1';
      const chess = new Chess(testFen);
      const { capturedWhite, capturedBlack, materialAdvantage } = ChessEngine.calculateMaterialAndCaptures(chess);

      expect(capturedWhite).toContain('q');
      expect(capturedWhite).toContain('p');
      expect(capturedBlack).toContain('n');
      expect(materialAdvantage.black).toBeGreaterThan(0);
      expect(materialAdvantage.white).toBe(0);
    });
  });
});
