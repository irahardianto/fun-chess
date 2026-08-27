import { describe, it, expect } from 'vitest';
import type { Puzzle } from '@fun-chess/shared';
import {
  validatePuzzleMove,
  formatPlayerMoveToUci,
  parseUciMove,
  isPawnPromotionMove,
  getLegalMovesForSquare,
  isPieceOfColor,
} from '../puzzle_validator';

describe('Puzzle Validator Engine', () => {
  const singlePlyPuzzle: Puzzle = {
    id: 'test_single_001',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    moves: ['a1a8'],
    rating: 700,
    ratingDeviation: 100,
    themes: ['back_rank_mate', 'mate_in_1'],
    primaryTheme: 'back_rank_mate',
    difficulty: 'novice',
    title: 'Back Rank Mate in 1',
    tacticalGoal: 'Deliver checkmate to the back-rank King',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: 'Ra8 delivered back rank checkmate!',
    keyTakeaway: 'Watch for trapped back-rank Kings!',
    playerColor: 'w',
    solutionPlies: 1,
  };

  const multiPlyPuzzle: Puzzle = {
    id: 'test_multi_001',
    fen: 'r3k2r/ppp2ppp/2n1pn2/3p4/3P4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
    moves: ['c3b5', 'e8d8', 'b5c7', 'd8c7'],
    rating: 850,
    ratingDeviation: 100,
    themes: ['fork'],
    primaryTheme: 'fork',
    difficulty: 'novice',
    title: 'Knight Fork Adventure',
    tacticalGoal: 'Fork King and Rook on c7',
    tacticalReward: 'win_rook',
    outcomeAdvantage: '+5 Rook ♜',
    learningSummary: 'Knight jumped to b5 and c7 to fork the King and Rook.',
    keyTakeaway: 'Knights jump over obstacles to fork pieces!',
    playerColor: 'w',
    solutionPlies: 4,
  };

  const promoPuzzle: Puzzle = {
    id: 'test_promo_001',
    fen: '8/4P3/8/8/8/4k3/8/6K1 w - - 0 1',
    moves: ['e7e8q', 'e3d3', 'e8e3'],
    rating: 750,
    ratingDeviation: 100,
    themes: ['pawn_endgame'],
    primaryTheme: 'pawn_endgame',
    difficulty: 'novice',
    title: 'Promote to Queen',
    tacticalGoal: 'Promote your pawn to a Queen to win the endgame',
    tacticalReward: 'pawn_promotion',
    outcomeAdvantage: '+9 Queen ♛',
    learningSummary: 'Promoting the pawn creates a decisive queen advantage.',
    keyTakeaway: 'Passed pawns must be pushed!',
    playerColor: 'w',
    solutionPlies: 3,
  };

  describe('validatePuzzleMove', () => {
    it('validates a correct single-ply player move and marks puzzle complete with analysis and step explanation', () => {
      const outcome = validatePuzzleMove(
        singlePlyPuzzle,
        0,
        singlePlyPuzzle.fen,
        { from: 'a1', to: 'a8' }
      );

      expect(outcome.isCorrect).toBe(true);
      expect(outcome.isPuzzleComplete).toBe(true);
      expect(outcome.nextFen).toContain('R5k1/5ppp/8/8/8/8/8/4K3 b - - 1 1');
      expect(outcome.botReplyMove).toBeUndefined();
      expect(outcome.feedback).toContain('solved the puzzle');
      expect(outcome.stepExplanation).toBeDefined();
      expect(outcome.stepExplanation?.moveSan).toBe('Ra8#');
      expect(outcome.analysis).toBeDefined();
      expect(outcome.analysis?.isCheckmate).toBe(true);
      expect(outcome.analysis?.advantageSummary.formattedAdvantage).toBe('Checkmate 👑');
    });

    it('rejects an incorrect move with refutation analysis', () => {
      const outcome = validatePuzzleMove(
        singlePlyPuzzle,
        0,
        singlePlyPuzzle.fen,
        { from: 'a1', to: 'b1' }
      );

      expect(outcome.isCorrect).toBe(false);
      expect(outcome.isPuzzleComplete).toBe(false);
      expect(outcome.nextFen).toBe(singlePlyPuzzle.fen);
      expect(outcome.nextMoveIndex).toBe(0);
      expect(outcome.refutation).toBeDefined();
      expect(outcome.feedback).toBeDefined();
    });

    it('handles multi-ply moves and returns the automated bot counter-move and stepExplanation', () => {
      // Ply 0: Player plays c3b5
      const ply0 = validatePuzzleMove(
        multiPlyPuzzle,
        0,
        multiPlyPuzzle.fen,
        { from: 'c3', to: 'b5' }
      );

      expect(ply0.isCorrect).toBe(true);
      expect(ply0.isPuzzleComplete).toBe(false);
      expect(ply0.botReplyMove).toBeDefined();
      expect(ply0.botReplyMove?.from).toBe('e8');
      expect(ply0.botReplyMove?.to).toBe('d8');
      expect(ply0.nextMoveIndex).toBe(2); // Ready for player's next move (ply 2)
      expect(ply0.stepExplanation?.moveSan).toBe('Nb5');

      // Ply 2: Player plays b5c7
      const ply2 = validatePuzzleMove(
        multiPlyPuzzle,
        ply0.nextMoveIndex,
        ply0.nextFen,
        { from: 'b5', to: 'c7' }
      );

      expect(ply2.isCorrect).toBe(true);
      expect(ply2.isPuzzleComplete).toBe(true); // Final bot response finishes line
      expect(ply2.botReplyMove?.from).toBe('d8');
      expect(ply2.botReplyMove?.to).toBe('c7');
      expect(ply2.analysis).toBeDefined();
    });

    it('validates pawn promotion moves', () => {
      const outcome = validatePuzzleMove(
        promoPuzzle,
        0,
        promoPuzzle.fen,
        { from: 'e7', to: 'e8', promotion: 'q' }
      );

      expect(outcome.isCorrect).toBe(true);
      expect(outcome.botReplyMove?.from).toBe('e3');
      expect(outcome.botReplyMove?.to).toBe('d3');
      expect(outcome.stepExplanation?.moveSan).toContain('e8=Q');
    });

    it('handles edge cases gracefully (invalid index, empty puzzle)', () => {
      const outcome = validatePuzzleMove(
        singlePlyPuzzle,
        5,
        singlePlyPuzzle.fen,
        { from: 'a1', to: 'a8' }
      );
      expect(outcome.isCorrect).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    it('formats player move to standard UCI', () => {
      expect(formatPlayerMoveToUci({ from: 'e2', to: 'e4' })).toBe('e2e4');
      expect(formatPlayerMoveToUci({ from: 'e7', to: 'e8', promotion: 'q' })).toBe('e7e8q');
    });

    it('parses UCI strings accurately', () => {
      const parsed = parseUciMove('e7e8q');
      expect(parsed.from).toBe('e7');
      expect(parsed.to).toBe('e8');
      expect(parsed.promotion).toBe('q');

      const parsedNoPromo = parseUciMove('e2e4');
      expect(parsedNoPromo.from).toBe('e2');
      expect(parsedNoPromo.to).toBe('e4');
      expect(parsedNoPromo.promotion).toBeUndefined();
    });

    it('identifies pawn promotion moves', () => {
      expect(isPawnPromotionMove(promoPuzzle.fen, 'e7', 'e8')).toBe(true);
      expect(isPawnPromotionMove(promoPuzzle.fen, 'e7', 'e6')).toBe(false);
      expect(isPawnPromotionMove(singlePlyPuzzle.fen, 'a1', 'a8')).toBe(false);
    });

    it('fetches legal moves for a given square', () => {
      const moves = getLegalMovesForSquare(singlePlyPuzzle.fen, 'a1');
      expect(moves.length).toBeGreaterThan(0);
      expect(moves).toContain('a8');
    });

    it('determines if a square belongs to a player color', () => {
      expect(isPieceOfColor(singlePlyPuzzle.fen, 'a1', 'w')).toBe(true);
      expect(isPieceOfColor(singlePlyPuzzle.fen, 'g8', 'w')).toBe(false);
      expect(isPieceOfColor(singlePlyPuzzle.fen, 'g8', 'b')).toBe(true);
      expect(isPieceOfColor(singlePlyPuzzle.fen, 'e4', 'w')).toBe(false);
    });
  });
});

