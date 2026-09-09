import { describe, it, expect, vi } from 'vitest';
import type { Puzzle } from '@fun-chess/shared';
import { logger } from '@/platform/telemetry';
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

    describe('Alternative Checkmate Acceptance', () => {
      const dualMatePuzzle: Puzzle = {
        id: 'test_dual_mate_001',
        fen: '6k1/5ppp/8/8/8/8/1Q4Q1/4K3 w - - 0 1',
        moves: ['b2b8'],
        rating: 800,
        ratingDeviation: 80,
        themes: ['mate_in_1'],
        primaryTheme: 'mate_in_1',
        difficulty: 'novice',
        title: 'Dual Checkmate',
        tacticalGoal: 'Deliver checkmate to the black King',
        tacticalReward: 'checkmate',
        outcomeAdvantage: 'Checkmate 👑',
        learningSummary: 'Delivered decisive checkmate.',
        keyTakeaway: 'Always prioritize checkmate.',
        playerColor: 'w',
        solutionPlies: 1,
      };

      it('accepts alternative legal move that delivers checkmate even when differing from expected UCI', () => {
        // Player plays g2g7 (Qg7#) instead of expected b2b8 (Qb8#)
        const outcome = validatePuzzleMove(
          dualMatePuzzle,
          0,
          dualMatePuzzle.fen,
          { from: 'g2', to: 'g7' }
        );

        expect(outcome.isCorrect).toBe(true);
        expect(outcome.isPuzzleComplete).toBe(true);
        expect(outcome.nextMoveIndex).toBe(dualMatePuzzle.moves.length);
        expect(outcome.feedback).toContain('checkmate');
        expect(outcome.stepExplanation?.moveSan).toContain('#');
        expect(outcome.analysis?.isCheckmate).toBe(true);
      });

      it('accepts alternative checkmate on ply 0 of multi-ply puzzle, bypassing longer line and completing puzzle', () => {
        // Multi-ply puzzle where player plays an immediate checkmate bypassing multi-ply line
        const multiPlyBypassPuzzle: Puzzle = {
          id: 'test_bypass_001',
          fen: '4k2r/8/8/8/8/8/r7/R3K3 b - - 0 1',
          moves: ['a2a1', 'e1e2', 'a1h1'],
          rating: 1200,
          ratingDeviation: 80,
          themes: ['skewer'],
          primaryTheme: 'skewer',
          difficulty: 'medium',
          title: 'Bypass Skewer With Checkmate',
          tacticalGoal: 'Skewer the king or checkmate',
          tacticalReward: 'checkmate',
          outcomeAdvantage: 'Checkmate 👑',
          learningSummary: 'Checkmate immediately ended the game.',
          keyTakeaway: 'Checkmate trumps material gains.',
          playerColor: 'b',
          solutionPlies: 3,
        };

        // Player plays 1... Rh1# (h8h1) instead of 1... Rxa1+ (a2a1)
        const outcome = validatePuzzleMove(
          multiPlyBypassPuzzle,
          0,
          multiPlyBypassPuzzle.fen,
          { from: 'h8', to: 'h1' }
        );

        expect(outcome.isCorrect).toBe(true);
        expect(outcome.isPuzzleComplete).toBe(true);
        expect(outcome.nextMoveIndex).toBe(multiPlyBypassPuzzle.moves.length);
        expect(outcome.botReplyMove).toBeUndefined();
        expect(outcome.feedback).toContain('checkmate');
      });

      it('rejects alternative legal move that does NOT deliver checkmate', () => {
        const outcome = validatePuzzleMove(
          dualMatePuzzle,
          0,
          dualMatePuzzle.fen,
          { from: 'b2', to: 'b4' }
        );

        expect(outcome.isCorrect).toBe(false);
        expect(outcome.isPuzzleComplete).toBe(false);
        expect(outcome.feedback).toContain('Not quite');
      });
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

    it('gracefully handles malformed FEN in isPawnPromotionMove, getLegalMovesForSquare, and isPieceOfColor (MIN-041)', () => {
      const invalidFen = 'not-a-valid-fen-string';
      expect(isPawnPromotionMove(invalidFen, 'e7', 'e8')).toBe(false);
      expect(getLegalMovesForSquare(invalidFen, 'e2')).toEqual([]);
      expect(isPieceOfColor(invalidFen, 'e2', 'w')).toBe(false);
    });

    it('gracefully handles malformed FEN in validatePuzzleMove (MIN-041)', () => {
      const invalidFen = 'corrupted-board-fen';
      const outcome = validatePuzzleMove(
        singlePlyPuzzle,
        0,
        invalidFen,
        { from: 'a1', to: 'a8' }
      );
      expect(outcome.isCorrect).toBe(false);
      expect(outcome.isPuzzleComplete).toBe(false);
      expect(outcome.feedback).toBe('Corrupted board state.');
    });

    describe('Defensive bounds and error handling (MIN-029)', () => {
      it('handles negative move index (-1)', () => {
        const outcome = validatePuzzleMove(
          singlePlyPuzzle,
          -1,
          singlePlyPuzzle.fen,
          { from: 'a1', to: 'a8' }
        );
        expect(outcome.isCorrect).toBe(false);
        expect(outcome.isPuzzleComplete).toBe(false);
        expect(outcome.feedback).toBe('Puzzle session is invalid or already finished.');
      });

      it('handles out-of-bounds high move index (99)', () => {
        const outcome = validatePuzzleMove(
          singlePlyPuzzle,
          99,
          singlePlyPuzzle.fen,
          { from: 'a1', to: 'a8' }
        );
        expect(outcome.isCorrect).toBe(false);
        expect(outcome.isPuzzleComplete).toBe(false);
        expect(outcome.feedback).toBe('Puzzle session is invalid or already finished.');
      });

      it('handles empty moves array in puzzle', () => {
        const emptyMovesPuzzle = { ...singlePlyPuzzle, moves: [] };
        const outcome = validatePuzzleMove(
          emptyMovesPuzzle,
          0,
          singlePlyPuzzle.fen,
          { from: 'a1', to: 'a8' }
        );
        expect(outcome.isCorrect).toBe(false);
        expect(outcome.isPuzzleComplete).toBe(false);
        expect(outcome.feedback).toBe('Puzzle session is invalid or already finished.');
      });

      it('handles null/undefined puzzle object', () => {
        const outcome = validatePuzzleMove(
          null as unknown as Puzzle,
          0,
          singlePlyPuzzle.fen,
          { from: 'a1', to: 'a8' }
        );
        expect(outcome.isCorrect).toBe(false);
        expect(outcome.feedback).toBe('Puzzle session is invalid or already finished.');
      });

      it('handles empty expected move string', () => {
        const badMovesPuzzle = { ...singlePlyPuzzle, moves: [''] };
        const outcome = validatePuzzleMove(
          badMovesPuzzle,
          0,
          singlePlyPuzzle.fen,
          { from: 'a1', to: 'a8' }
        );
        expect(outcome.isCorrect).toBe(false);
        expect(outcome.feedback).toBe('Expected move could not be found.');
      });

      it('handles player move matching expected UCI but illegal in board state', () => {
        // Expected UCI is e1e8, but e1e8 is illegal for King in starting board position
        const illegalPuzzle = {
          ...singlePlyPuzzle,
          moves: ['e1e8'],
        };
        const outcome = validatePuzzleMove(
          illegalPuzzle,
          0,
          singlePlyPuzzle.fen,
          { from: 'e1', to: 'e8' }
        );
        expect(outcome.isCorrect).toBe(false);
        expect(outcome.feedback).toBe('Illegal move in current position.');
      });

      it('handles illegal opponent move in multi-ply puzzle without throwing', () => {
        // In this multi-ply puzzle, player plays valid move c3b5, but opponent move is illegal 'e8a1'
        const badOpponentPuzzle: Puzzle = {
          ...multiPlyPuzzle,
          moves: ['c3b5', 'e8a1', 'b5c7'],
        };
        const outcome = validatePuzzleMove(
          badOpponentPuzzle,
          0,
          badOpponentPuzzle.fen,
          { from: 'c3', to: 'b5' }
        );
        expect(outcome.isCorrect).toBe(true);
        expect(outcome.botReplyMove).toBeUndefined();
      });

      it('logs structured warning when createSafeChess fails on corrupted board state (MAJ-001)', async () => {
        const warnSpy = vi.spyOn(logger, 'warn');
        // Valid FEN format that fails chess instantiation
        const validFormatFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        const chessFactory = await import('@fun-chess/shared');
        vi.spyOn(chessFactory, 'createSafeChess').mockImplementationOnce(() => {
          throw new Error('Simulated engine crash on corrupted position');
        });

        const outcome = validatePuzzleMove(
          singlePlyPuzzle,
          0,
          validFormatFen,
          { from: 'a1', to: 'a8' }
        );

        expect(outcome.isCorrect).toBe(false);
        expect(outcome.feedback).toBe('Corrupted board state.');
        expect(warnSpy).toHaveBeenCalledWith(
          'Corrupted board state during move validation',
          expect.objectContaining({
            operation: 'puzzle_validate_move_safe_chess',
            currentFen: validFormatFen,
          })
        );
        warnSpy.mockRestore();
      });

      it('logs structured debug message when player move execution fails in engine (MAJ-001)', () => {
        const debugSpy = vi.spyOn(logger, 'debug');
        const outcome = validatePuzzleMove(
          singlePlyPuzzle,
          0,
          singlePlyPuzzle.fen,
          { from: 'z9' as any, to: 'z10' as any }
        );

        expect(outcome.isCorrect).toBe(false);
        expect(debugSpy).toHaveBeenCalledWith(
          'Illegal player move execution in chess engine',
          expect.objectContaining({
            operation: 'puzzle_validate_player_move',
            from: 'z9',
            to: 'z10',
          })
        );
        debugSpy.mockRestore();
      });

      it('logs structured debug message when bot counter-move execution fails in engine (MAJ-001)', () => {
        const debugSpy = vi.spyOn(logger, 'debug');
        const badOpponentPuzzle: Puzzle = {
          ...multiPlyPuzzle,
          moves: ['c3b5', 'e8a1', 'b5c7'],
        };
        const outcome = validatePuzzleMove(
          badOpponentPuzzle,
          0,
          badOpponentPuzzle.fen,
          { from: 'c3', to: 'b5' }
        );

        expect(outcome.isCorrect).toBe(true);
        expect(debugSpy).toHaveBeenCalledWith(
          'Illegal bot counter-move execution in chess engine',
          expect.objectContaining({
            operation: 'puzzle_validate_bot_move',
            opponentUci: 'e8a1',
          })
        );
        debugSpy.mockRestore();
      });
    });
  });
});

