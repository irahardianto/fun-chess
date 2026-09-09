import { describe, it, expect, vi } from 'vitest';
import { Chess } from 'chess.js';
import type { Puzzle, PuzzleAnalysisResult } from '@fun-chess/shared';
import { logger } from '@/platform/telemetry';
import {
  THEME_RULES_OF_THUMB,
  PIECE_DISPLAY_NAMES,
  findCheckmateRefutation,
  findCaptureRefutation,
  findCheckRefutation,
  generateMistakeRefutation,
  generateStepBreakdowns,
  generateKidExplanation,
} from '../rules_of_thumb';

describe('Pedagogical Rules of Thumb & Mistake Refutations', () => {
  it('exposes theme rules of thumb and piece display names', () => {
    expect(THEME_RULES_OF_THUMB['fork']).toContain('Knights and Queens');
    expect(THEME_RULES_OF_THUMB['pin']).toContain('pinned');
    expect(PIECE_DISPLAY_NAMES['q']).toBe('Queen');
    expect(PIECE_DISPLAY_NAMES['n']).toBe('Knight');
  });

  describe('findCheckmateRefutation', () => {
    it('returns checkmate refutation when opponent can deliver immediate mate', () => {
      // Fool's Mate setup: White just played g4, Black can play Qh4#
      const chess = new Chess('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
      const oppMoves = chess.moves({ verbose: true });
      const ref = findCheckmateRefutation(chess, oppMoves, 'g2g4', 'g4', 'b');

      expect(ref).not.toBeNull();
      expect(ref?.punishingActor).toBe('b');
      expect(ref?.blunderReason).toContain('immediate checkmate');
      expect(ref?.threatSquare).toBe('h4');
    });

    it('returns null when no checkmate is available for opponent', () => {
      const chess = new Chess();
      const oppMoves = chess.moves({ verbose: true });
      const ref = findCheckmateRefutation(chess, oppMoves, 'e2e4', 'e4', 'b');
      expect(ref).toBeNull();
    });
  });

  describe('findCaptureRefutation', () => {
    it('returns highest-value capture refutation when material is left hanging', () => {
      // Black Queen captures unprotected White Rook
      const chess = new Chess('4k3/8/8/8/8/8/4q3/4R1K1 b - - 0 1');
      const oppMoves = chess.moves({ verbose: true });
      const ref = findCaptureRefutation(oppMoves, 'h2h3', 'h3', 'b');

      expect(ref).not.toBeNull();
      expect(ref?.capturedPiece).toBe('r');
      expect(ref?.blunderReason).toContain('Rook');
      expect(ref?.threatSquare).toBe('e1');
    });

    it('returns null when opponent has no captures', () => {
      const chess = new Chess();
      const oppMoves = chess.moves({ verbose: true });
      const ref = findCaptureRefutation(oppMoves, 'e2e4', 'e4', 'b');
      expect(ref).toBeNull();
    });
  });

  describe('findCheckRefutation', () => {
    it('returns checking refutation when opponent can counter-attack with check', () => {
      // Black King on e8, White Rook delivers Ra8+
      const chess = new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
      const moves = chess.moves({ verbose: true });
      const ref = findCheckRefutation(moves, 'a7a6', 'a6', 'w');

      expect(ref).not.toBeNull();
      expect(ref?.blunderReason).toContain('counter-attack with check');
      expect(ref?.threatSquare).toBe('a8');
    });

    it('returns null when no checks exist', () => {
      const chess = new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
      const moves = chess.moves({ verbose: true });
      const ref = findCheckRefutation(moves, 'e1e2', 'Ke2', 'w');
      expect(ref).toBeNull();
    });
  });

  describe('generateMistakeRefutation', () => {
    it('returns null on invalid FEN or illegal player move', () => {
      expect(generateMistakeRefutation('invalid-fen', { from: 'e2', to: 'e4' })).toBeNull();
      expect(generateMistakeRefutation('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { from: 'a1', to: 'a8' })).toBeNull();
    });

    it('handles corrupt move coordinates and engine exceptions gracefully without throwing', () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      // Completely corrupt square coordinates that bypass TypeScript at runtime
      expect(generateMistakeRefutation(fen, { from: 'z9' as any, to: 'z10' as any })).toBeNull();
      expect(debugSpy).toHaveBeenCalledWith(
        'Illegal player move in generateMistakeRefutation',
        expect.objectContaining({
          operation: 'refutation_player_move',
        })
      );
      // Illegal move in position
      expect(generateMistakeRefutation(fen, { from: 'e1', to: 'e8' })).toBeNull();
      debugSpy.mockRestore();
    });

    it('returns checkmate refutation for blunders allowing checkmate', () => {
      // White plays 2.g4 allowing Qh4#
      const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
      const ref = generateMistakeRefutation(fen, { from: 'g2', to: 'g4' });
      expect(ref).not.toBeNull();
      expect(ref?.blunderReason).toContain('immediate checkmate');
    });

    it('returns capture refutation for blunders hanging pieces', () => {
      // White moves Bishop to unprotected d5 where Black Queen can capture it
      const fen = 'rnb1kbnr/pppp1ppp/8/4q3/8/5B2/PPPPPPPP/RNBQK1NR w KQkq - 0 1';
      const ref = generateMistakeRefutation(fen, { from: 'f3', to: 'd5' });
      expect(ref).not.toBeNull();
      expect(ref?.capturedPiece).toBe('b');
    });

    it('returns default escape refutation when move is not punishingly tactical', () => {
      const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
      const ref = generateMistakeRefutation(fen, { from: 'e2', to: 'e3' });
      expect(ref).not.toBeNull();
      expect(ref?.blunderReason).toContain('defend and escape');
    });
  });

  describe('generateStepBreakdowns', () => {
    const samplePuzzle: Puzzle = {
      id: 'puz_sample',
      fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
      moves: ['a1a8'],
      rating: 800,
      ratingDeviation: 50,
      themes: ['back_rank_mate'],
      primaryTheme: 'back_rank_mate',
      difficulty: 'novice',
      title: 'Back Rank',
      tacticalGoal: 'Mate',
      tacticalReward: 'checkmate',
      outcomeAdvantage: 'Win',
      learningSummary: 'Ra8# delivers back rank checkmate.',
      keyTakeaway: 'Take back rank',
      playerColor: 'w',
      solutionPlies: 1,
    };

    it('returns empty array for invalid puzzle or empty moves', () => {
      expect(generateStepBreakdowns(null as any)).toEqual([]);
      expect(generateStepBreakdowns({ ...samplePuzzle, moves: [] })).toEqual([]);
      expect(generateStepBreakdowns({ ...samplePuzzle, fen: 'bad-fen' })).toEqual([]);
    });

    it('handles corrupt or illegal moves in puzzle solution gracefully', () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      const corruptMovesPuzzle: Puzzle = {
        ...samplePuzzle,
        moves: ['z9z8', 'e1e8'],
      };
      const steps = generateStepBreakdowns(corruptMovesPuzzle);
      expect(steps.length).toBe(2);
      expect(steps[0]?.moveSan).toBe('z9z8');
      expect(steps[0]?.moveUci).toBe('z9z8');
      expect(steps[0]?.explanation).toBeDefined();
      expect(debugSpy).toHaveBeenCalledWith(
        'Illegal solution move in generateStepBreakdowns',
        expect.objectContaining({
          operation: 'step_breakdowns_move',
          moveUci: 'z9z8',
        })
      );
      debugSpy.mockRestore();
    });

    it('synthesizes step explanations for player checkmate', () => {
      const steps = generateStepBreakdowns(samplePuzzle);
      expect(steps.length).toBe(1);
      expect(steps[0]?.explanation).toContain('checkmate');
      expect(steps[0]?.moveSan).toBe('Ra8#');
    });

    it('uses predefined stepExplanations when available in puzzle', () => {
      const customPuzzle: Puzzle = {
        ...samplePuzzle,
        stepExplanations: [
          {
            plyIndex: 0,
            moveSan: 'Ra8#',
            moveUci: 'a1a8',
            actor: 'w',
            explanation: 'Custom author explanation for Ra8#',
          },
        ],
      };
      const steps = generateStepBreakdowns(customPuzzle);
      expect(steps[0]?.explanation).toBe('Custom author explanation for Ra8#');
    });

    it('synthesizes check, capture, promotion, and opponent replies', () => {
      // 3-ply puzzle with check, opponent capture reply, and promotion
      const multiPlyPuzzle: Puzzle = {
        ...samplePuzzle,
        fen: '4k3/4P3/8/8/8/8/8/4K2R w - - 0 1',
        moves: ['h1h8', 'e8e7', 'e1e2'],
        solutionPlies: 3,
      };

      const steps = generateStepBreakdowns(multiPlyPuzzle);
      expect(steps.length).toBe(3);
      expect(steps[0]?.explanation).toContain('checking the enemy King');
      expect(steps[1]?.explanation).toContain('Opponent');
    });

    it('synthesizes promotion step explanations', () => {
      const promoPuzzle: Puzzle = {
        ...samplePuzzle,
        fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1',
        moves: ['e7e8q'],
        solutionPlies: 1,
      };

      const steps = generateStepBreakdowns(promoPuzzle);
      expect(steps.length).toBe(1);
      expect(steps[0]?.explanation).toContain('promote');
    });
  });

  describe('generateKidExplanation', () => {
    const basePuzzle: Puzzle = {
      id: 'puz_kid',
      fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
      moves: ['a1a8'],
      rating: 800,
      ratingDeviation: 50,
      themes: ['back_rank_mate'],
      primaryTheme: 'back_rank_mate',
      difficulty: 'novice',
      title: 'Kid Explanation',
      tacticalGoal: 'Mate',
      tacticalReward: 'checkmate',
      outcomeAdvantage: 'Win',
      learningSummary: '',
      keyTakeaway: 'Take back rank',
      playerColor: 'w',
      solutionPlies: 1,
    };

    const mockAnalysis = (theme: string, isCheckmate = false): PuzzleAnalysisResult => ({
      isCheckmate,
      detectedTheme: theme as any,
      initialMaterial: { white: 0, black: 0, net: 0 },
      finalMaterial: { white: 0, black: 0, net: 0 },
      materialDeltaCentipawns: 500,
      netPointsDelta: 5,
      isPawnPromotion: false,
      tacticalHeadline: 'Tactical headline',
      kidFriendlyExplanation: 'Explanation',
      ruleOfThumb: 'Rule',
      stepNarratives: [],
      advantageSummary: {
        netCentipawns: 500,
        netPoints: 5,
        formattedAdvantage: '+5 Material',
        isDecisive: true,
      },
    });

    it('returns custom learningSummary when populated', () => {
      const withSummary: Puzzle = { ...basePuzzle, learningSummary: 'Custom summary!' };
      expect(generateKidExplanation(withSummary, mockAnalysis('fork'))).toBe('Custom summary!');
    });

    it('returns checkmate explanation when isCheckmate is true', () => {
      expect(generateKidExplanation(basePuzzle, mockAnalysis('fork', true))).toContain('Checkmate!');
    });

    it('returns theme-specific explanations for all major themes', () => {
      expect(generateKidExplanation(basePuzzle, mockAnalysis('fork'))).toContain('fork');
      expect(generateKidExplanation(basePuzzle, mockAnalysis('pin'))).toContain('pin');
      expect(generateKidExplanation(basePuzzle, mockAnalysis('skewer'))).toContain('skewer');
      expect(generateKidExplanation(basePuzzle, mockAnalysis('discovered_attack'))).toContain('discovered attack');
      expect(generateKidExplanation(basePuzzle, mockAnalysis('back_rank_mate'))).toContain('Back rank');
      expect(generateKidExplanation(basePuzzle, mockAnalysis('smothered_mate'))).toContain('Smothered mate');
      expect(generateKidExplanation(basePuzzle, mockAnalysis('unknown_theme'))).toContain('Great tactical vision');
    });
  });
});
