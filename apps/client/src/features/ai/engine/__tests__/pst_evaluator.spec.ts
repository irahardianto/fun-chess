import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  evaluateBoard,
  evaluateFen,
  isEndgamePhase,
  getMaterialCount,
  CHECKMATE_SCORE,
  STALEMATE_SCORE,
} from '../pst_evaluator.js';
import {
  DEFAULT_PST_TABLES,
  getPieceSquareValue,
  PIECE_VALUES,
  type PieceSquareTableSet,
} from '../piece_square_tables.js';

describe('PST Evaluator (Static Material & Positional Evaluation)', () => {
  describe('Starting Position & Material Balance', () => {
    it('evaluates initial starting position as exactly 0 with symmetric PST tables', () => {
      const chess = new Chess();
      const score = evaluateBoard(chess, true);
      expect(score).toBe(0);
    });

    it('correctly calculates raw material count for all pieces', () => {
      const chess = new Chess();
      const count = getMaterialCount(chess);
      // 8 pawns (800) + 2 knights (640) + 2 bishops (660) + 2 rooks (1000) + 1 queen (900) = 4000
      expect(count.white).toBe(4000);
      expect(count.black).toBe(4000);
      expect(count.net).toBe(0);
    });

    it('evaluates material advantage positively when White has extra queen', () => {
      const fen = '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1';
      const score = evaluateFen(fen, false);
      expect(score).toBe(PIECE_VALUES.q); // 900
    });

    it('evaluates material advantage negatively when Black has extra rook', () => {
      const fen = '4k3/4r3/8/8/8/8/8/4K3 w - - 0 1';
      const score = evaluateFen(fen, false);
      expect(score).toBe(-PIECE_VALUES.r); // -500
    });

    it('evaluates piece trade imbalances (e.g. 2 Minor Pieces vs 1 Rook)', () => {
      // White has 2 Bishops (330 + 330 = 660), Black has 1 Rook (500)
      const fen = '4k3/4r3/8/8/8/8/2B1B3/4K3 w - - 0 1';
      const material = getMaterialCount(new Chess(fen));
      expect(material.white).toBe(660);
      expect(material.black).toBe(500);
      expect(material.net).toBe(160);
    });
  });

  describe('Positional Evaluation (Piece-Square Tables)', () => {
    it('evaluates centralized Knight higher than rim/corner Knight', () => {
      // White Knight on e4 (central) vs White Knight on a1 (corner)
      const centralKnightVal = getPieceSquareValue('n', 'w', 'e4', false);
      const cornerKnightVal = getPieceSquareValue('n', 'w', 'a1', false);

      expect(centralKnightVal).toBeGreaterThan(cornerKnightVal);

      const centralKnightFen = '4k3/p7/8/8/4N3/8/P7/4K3 w - - 0 1';
      const cornerKnightFen = '4k3/p7/8/8/8/8/P7/N3K3 w - - 0 1';

      const centralScore = evaluateFen(centralKnightFen, true);
      const cornerScore = evaluateFen(cornerKnightFen, true);

      expect(centralScore).toBeGreaterThan(cornerScore);
    });

    it('rewards advanced Pawns nearing promotion ranks', () => {
      const pawnRank2 = getPieceSquareValue('p', 'w', 'e2', false);
      const pawnRank6 = getPieceSquareValue('p', 'w', 'e6', false);
      const pawnRank7 = getPieceSquareValue('p', 'w', 'e7', false);

      expect(pawnRank7).toBeGreaterThan(pawnRank2);
      expect(pawnRank6).toBeGreaterThan(pawnRank2);
    });

    it('rewards active Bishops on open diagonals over back-rank corners', () => {
      const activeBishop = getPieceSquareValue('b', 'w', 'c4', false);
      const cornerBishop = getPieceSquareValue('b', 'w', 'a1', false);

      expect(activeBishop).toBeGreaterThan(cornerBishop);
    });

    it('rewards King safety in corner during middlegame and centralization in endgame', () => {
      // Middlegame: King on g1 (castled) should score higher than King on e4 (exposed)
      const mgCastledKing = getPieceSquareValue('k', 'w', 'g1', false);
      const mgCenterKing = getPieceSquareValue('k', 'w', 'e4', false);
      expect(mgCastledKing).toBeGreaterThan(mgCenterKing);

      // Endgame: King on e4 (centralized) should score higher than King on h1 (cornered)
      const egCenterKing = getPieceSquareValue('k', 'w', 'e4', true);
      const egCornerKing = getPieceSquareValue('k', 'w', 'h1', true);
      expect(egCenterKing).toBeGreaterThan(egCornerKing);
    });

    it('supports custom Piece-Square Table sets', () => {
      const customPst: PieceSquareTableSet = {
        ...DEFAULT_PST_TABLES,
        knights: new Array(64).fill(100), // Uniform knight table
      };

      const val = getPieceSquareValue('n', 'w', 'a1', false, customPst);
      expect(val).toBe(100);
    });
  });

  describe('Game Phase Detection & Terminal States', () => {
    it('detects middlegame phase vs endgame phase based on 1300 non-pawn material threshold', () => {
      // Full board: ~3200 non-pawn material -> middlegame
      const fullBoard = new Chess();
      expect(isEndgamePhase(fullBoard)).toBe(false);

      // Only Kings and Pawns: 0 non-pawn material -> endgame
      const pawnEndgame = new Chess('4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 1');
      expect(isEndgamePhase(pawnEndgame)).toBe(true);

      // Queen vs King (900 non-pawn material <= 1300) -> endgame
      const queenVsKing = new Chess('4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1');
      expect(isEndgamePhase(queenVsKing)).toBe(true);

      // 2 Rooks and 1 Bishop (500 + 500 + 330 = 1330 > 1300) -> middlegame
      const heavyPieces = new Chess('4k3/8/8/8/8/8/2R1R1B1/4K3 w - - 0 1');
      expect(isEndgamePhase(heavyPieces)).toBe(false);
    });

    it('identifies checkmate delivered by White as +CHECKMATE_SCORE (100000)', () => {
      // Scholar's Mate final position (Black is checkmated, turn is 'b')
      const fen = 'r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
      const score = evaluateFen(fen);
      expect(score).toBe(CHECKMATE_SCORE);
    });

    it('identifies checkmate delivered by Black as -CHECKMATE_SCORE (-100000)', () => {
      // Fool's mate (White is checkmated, turn is 'w')
      const fen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
      const score = evaluateFen(fen);
      expect(score).toBe(-CHECKMATE_SCORE);
    });

    it('identifies stalemate as STALEMATE_SCORE (0)', () => {
      const stalematedFen = 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1';
      const chess = new Chess(stalematedFen);
      expect(chess.isStalemate()).toBe(true);
      expect(evaluateBoard(chess)).toBe(STALEMATE_SCORE);
    });
  });
});
