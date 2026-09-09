import { describe, it, expect, vi } from 'vitest';
import type { Puzzle } from '@fun-chess/shared';
import { createSafeChess } from '@fun-chess/shared';
import {
  generateProgressiveHint,
  resolveHintPieceDetails,
  formatHintByLevel,
  type HintContext,
} from '../hint_generator';
import { logger } from '@/platform/telemetry';


describe('Progressive Hint Generator Engine', () => {
  const samplePuzzle: Puzzle = {
    id: 'hint_test_001',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    moves: ['a1a8'],
    rating: 700,
    ratingDeviation: 100,
    themes: ['back_rank_mate'],
    primaryTheme: 'back_rank_mate',
    difficulty: 'novice',
    title: 'Back Rank Mate in 1',
    tacticalGoal: 'Deliver back rank checkmate on a8',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: 'Ra8 delivered back rank checkmate!',
    keyTakeaway: 'Look for trapped back-rank Kings!',
    targetSquares: ['a8'],
    keySquares: ['g8'],
    playerColor: 'w',
    solutionPlies: 1,
  };

  it('returns level 0 none when requestedLevel is 0', () => {
    const hint = generateProgressiveHint(samplePuzzle, 0, samplePuzzle.fen, 0);
    expect(hint.level).toBe(0);
    expect(hint.tier).toBe('none');
    expect(hint.sourceSquare).toBeUndefined();
    expect(hint.targetSquare).toBeUndefined();
  });

  it('returns level 1 piece nudge with source square and conceptual rationale', () => {
    const hint = generateProgressiveHint(samplePuzzle, 0, samplePuzzle.fen, 1);
    expect(hint.level).toBe(1);
    expect(hint.tier).toBe('piece_nudge');
    expect(hint.sourceSquare).toBe('a1');
    expect(hint.targetSquare).toBeUndefined();
    expect(hint.tacticalObjective).toBe('Deliver back rank checkmate on a8');
    expect(hint.themeIcon).toBe('👑');
    expect(hint.message).toContain('Rook');
    expect(hint.message).toContain('a1');
    expect(hint.mascotDialogue).toBeDefined();
  });

  it('returns level 2 target glow with source square, target square, and threatSquares', () => {
    const hint = generateProgressiveHint(samplePuzzle, 0, samplePuzzle.fen, 2);
    expect(hint.level).toBe(2);
    expect(hint.tier).toBe('target_glow');
    expect(hint.sourceSquare).toBe('a1');
    expect(hint.targetSquare).toBe('a8');
    expect(hint.targetSquares).toEqual(['a8']);
    expect(hint.threatSquares).toBeDefined();
    expect(hint.message).toContain('a1');
    expect(hint.message).toContain('a8');
  });

  it('returns level 3 full solution with SAN, UCI moves, and highlightArrow', () => {
    const hint = generateProgressiveHint(samplePuzzle, 0, samplePuzzle.fen, 3);
    expect(hint.level).toBe(3);
    expect(hint.tier).toBe('full_solution');
    expect(hint.sourceSquare).toBe('a1');
    expect(hint.targetSquare).toBe('a8');
    expect(hint.solutionUci).toBe('a1a8');
    expect(hint.solutionSan).toContain('Ra8');
    expect(hint.highlightArrow).toEqual({ from: 'a1', to: 'a8' });
    expect(hint.message).toContain('a1 to a8');
  });

  it('handles edge case when puzzle moves are completed', () => {
    const hint = generateProgressiveHint(samplePuzzle, 5, samplePuzzle.fen, 1);
    expect(hint.level).toBe(0);
    expect(hint.tier).toBe('none');
  });

  it('generates dynamic ply-specific hints for intermediate moves using stepExplanations', () => {
    const multiPlyPuzzle: Puzzle = {
      id: 'hint_test_002',
      fen: 'r3k2r/8/4N3/8/8/8/8/4K3 w q - 0 1',
      moves: ['e6c7', 'e8d7', 'c7a8'],
      rating: 800,
      ratingDeviation: 90,
      themes: ['fork'],
      primaryTheme: 'fork',
      difficulty: 'easy',
      title: 'Knight Fork',
      tacticalGoal: 'Fork King and Rook on c7.',
      tacticalReward: 'win_rook',
      outcomeAdvantage: '+5 Rook ♜',
      learningSummary: 'White forked King and Rook and won the Rook cleanly!',
      keyTakeaway: 'Knight forks deliver maximum payoff.',
      playerColor: 'w',
      solutionPlies: 3,
      stepExplanations: [
        {
          plyIndex: 0,
          moveSan: 'Nc7+',
          moveUci: 'e6c7',
          actor: 'w',
          explanation: 'White checks the King and attacks the a8 Rook with Nc7+!',
        },
        {
          plyIndex: 1,
          moveSan: 'Kd7',
          moveUci: 'e8d7',
          actor: 'b',
          explanation: 'Black moves King out of check.',
        },
        {
          plyIndex: 2,
          moveSan: 'Nxa8',
          moveUci: 'c7a8',
          actor: 'w',
          explanation: 'White captures the undefended Rook on a8!',
        },
      ],
    };

    // Move index 2 (intermediate / final winning ply for player)
    // Board FEN after 1. Nc7+ Kd7: 8 rows (r7/2Nk4/8/8/8/8/8/4K3 w - - 1 2)
    const intermediateFen = 'r7/2Nk4/8/8/8/8/8/4K3 w - - 1 2';
    const hintL1 = generateProgressiveHint(multiPlyPuzzle, 2, intermediateFen, 1);
    expect(hintL1.level).toBe(1);
    expect(hintL1.sourceSquare).toBe('c7');
    expect(hintL1.message).toContain('captures the undefended Rook on a8');

    const hintL2 = generateProgressiveHint(multiPlyPuzzle, 2, intermediateFen, 2);
    expect(hintL2.level).toBe(2);
    expect(hintL2.sourceSquare).toBe('c7');
    expect(hintL2.targetSquare).toBe('a8');
    expect(hintL2.message).toContain('captures the undefended Rook on a8');

    const hintL3 = generateProgressiveHint(multiPlyPuzzle, 2, intermediateFen, 3);
    expect(hintL3.level).toBe(3);
    expect(hintL3.solutionSan).toBe('Nxa8');
    expect(hintL3.message).toContain('captures the undefended Rook on a8');
  });

  it('logs debug telemetry on move evaluation failure during hint generation (MIN-005)', () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    const invalidMovePuzzle: Puzzle = {
      ...samplePuzzle,
      moves: ['e1e8'],
    };

    const hint = generateProgressiveHint(invalidMovePuzzle, 0, samplePuzzle.fen, 1);
    expect(hint).toBeDefined();
    expect(debugSpy).toHaveBeenCalledWith(
      'Failed to evaluate move with chess engine for hint generation',
      expect.objectContaining({
        operation: 'generate_progressive_hint',
      })
    );
    debugSpy.mockRestore();
  });

  describe('resolveHintPieceDetails', () => {
    it('resolves piece details for a valid piece square', () => {
      const chess = createSafeChess(samplePuzzle.fen);
      const details = resolveHintPieceDetails('a1', chess);
      expect(details.pieceType).toBe('r');
      expect(details.color).toBe('w');
      expect(details.pieceName).toBe('Rook');
    });

    it('falls back to default Piece for an empty square', () => {
      const chess = createSafeChess(samplePuzzle.fen);
      const details = resolveHintPieceDetails('e4', chess);
      expect(details.pieceName).toBe('Piece');
      expect(details.pieceType).toBeUndefined();
    });
  });

  describe('formatHintByLevel', () => {
    const mockContext: HintContext = {
      from: 'a1',
      to: 'a8',
      san: 'Ra8#',
      expectedUci: 'a1a8',
      pieceName: 'Rook',
      themeIcon: '👑',
      tacticalObjective: 'Deliver checkmate',
    };

    it('formats level 1 hint correctly', () => {
      const hint = formatHintByLevel(1, mockContext);
      expect(hint.level).toBe(1);
      expect(hint.tier).toBe('piece_nudge');
      expect(hint.sourceSquare).toBe('a1');
    });

    it('formats level 2 hint correctly', () => {
      const hint = formatHintByLevel(2, mockContext);
      expect(hint.level).toBe(2);
      expect(hint.tier).toBe('target_glow');
      expect(hint.targetSquare).toBe('a8');
    });

    it('formats level 3 hint correctly', () => {
      const hint = formatHintByLevel(3, mockContext);
      expect(hint.level).toBe(3);
      expect(hint.tier).toBe('full_solution');
      expect(hint.solutionSan).toBe('Ra8#');
    });

    it('formats default / level 0 hint correctly', () => {
      const hint = formatHintByLevel(0, mockContext);
      expect(hint.level).toBe(0);
      expect(hint.tier).toBe('none');
    });
  });
});


