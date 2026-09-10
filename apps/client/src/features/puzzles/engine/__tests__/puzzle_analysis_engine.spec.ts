import { describe, it, expect, vi } from 'vitest';
import { Chess } from 'chess.js';
import type { Puzzle, PuzzleAnalysisResult } from '@fun-chess/shared';
import { createSafeChess } from '@fun-chess/shared';
import {
  classifyTacticalMotif,
  generateMistakeRefutation,
  generateKidExplanation,
  generateStepBreakdowns,
  analyzePuzzleSolution,
  calculateMaterialDelta,
  calculateColorMaterial,
  getPieceCounts,
  getMaterialCount,
  PIECE_CENTIPAWN_VALUES,
  STANDARD_PIECE_POINTS,
  puzzleAnalysisEngine,
  PuzzleAnalysisEngine,
} from '../puzzle_analysis_engine';


describe('PuzzleAnalysisEngine Unit Tests (MAJ-037)', () => {
  describe('classifyTacticalMotif', () => {
    it('classifies back_rank_mate when rook or queen delivers mate on opponent back rank', () => {
      // White Rook on a1 moves to a8 delivering checkmate against king on g8 trapped by pawns f7, g7, h7
      const fenBefore = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';
      const fenAfter = 'R5k1/5ppp/8/8/8/8/8/4K3 b - - 1 1';
      const motif = classifyTacticalMotif(fenBefore, 'a1a8', fenAfter);

      expect(motif.theme).toBe('back_rank_mate');
      expect(motif.confidence).toBe(0.95);
      expect(motif.explanation).toContain('Back rank mate');
    });

    it('classifies smothered_mate when knight delivers checkmate', () => {
      // Classic Philidor smothered mate with pinned h-pawn:
      // In 6rk/6pp/6N1/7Q/8/8/8/4K3 b - - 1 1:
      // King on h8 attacked by Ng6. h7 is pinned by Qh5 to h8. g7 cannot capture g6. Checkmate!
      const fenSmotheredAfter = '6rk/6pp/6N1/7Q/8/8/8/4K3 b - - 1 1';
      const motif = classifyTacticalMotif(
        '6rk/6pp/8/7Q/5N2/8/8/4K3 w - - 0 1',
        'f4g6',
        fenSmotheredAfter
      );

      expect(motif.theme).toBe('smothered_mate');
      expect(motif.confidence).toBe(0.95);
      expect(motif.explanation).toContain('Smothered mate');
    });

    it('classifies mate_in_1 when non-knight non-back-rank move delivers checkmate', () => {
      // White Queen delivers checkmate on open king
      const fen1 = '4k3/8/4K3/8/8/8/4Q3/8 w - - 0 1';
      const fen2 = '4k3/4Q3/4K3/8/8/8/8/8 b - - 1 1';
      const motif = classifyTacticalMotif(fen1, 'e2e7', fen2);

      expect(motif.theme).toBe('mate_in_1');
      expect(motif.confidence).toBe(0.95);
      expect(motif.explanation).toContain('Checkmate');
    });

    it('classifies double_check when two pieces attack King simultaneously', () => {
      // Discovered check with double check:
      // White Rook on e1, White Knight on e4, Black King on e8.
      // White plays Knight to d6+ (e4d6) -> Knight on d6 attacks King on e8 (dr=2, dc=1), and Rook on e1 attacks King on e8!
      const fenBefore = '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1';
      const fenAfter = '4k3/8/3N4/8/8/8/8/4R1K1 b - - 1 1';
      const motif = classifyTacticalMotif(fenBefore, 'e4d6', fenAfter);

      expect(motif.theme).toBe('double_check');
      expect(motif.confidence).toBe(0.95);
      expect(motif.explanation).toContain('Double check');
    });

    it('classifies discovered_check when moving piece uncovers check from behind', () => {
      // White Rook on e1, White Knight on e4, Black King on e8.
      // White Knight moves to c3 -> Rook on e1 attacks King on e8, but Knight on c3 does NOT attack King!
      const fenBefore = '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1';
      const fenAfter = '4k3/8/8/8/8/2N5/8/4R1K1 b - - 1 1';
      const motif = classifyTacticalMotif(fenBefore, 'e4c3', fenAfter);

      expect(motif.theme).toBe('discovered_check');
      expect(motif.confidence).toBe(0.90);
      expect(motif.explanation).toContain('Discovered check');
    });

    it('classifies pawn_endgame when a pawn promotes to Queen', () => {
      const fenBefore = '8/4P3/8/8/8/4k3/8/6K1 w - - 0 1';
      const fenAfter = '4Q3/8/8/8/8/4k3/8/6K1 b - - 0 1';
      const motif = classifyTacticalMotif(fenBefore, 'e7e8q', fenAfter);

      expect(motif.theme).toBe('pawn_endgame');
      expect(motif.confidence).toBe(0.85);
      expect(motif.explanation).toContain('Pawn promotion');
    });

    it('classifies fork when a piece attacks multiple high-value opponent pieces', () => {
      // Knight on d5 forks King on e7 and Rook on b6
      const fenBeforeMove = '8/4k3/1r6/8/8/2N5/8/4K3 w - - 0 1';
      const fenAfterMove = '8/4k3/1r6/3N4/8/8/8/4K3 b - - 1 1';
      const motif = classifyTacticalMotif(fenBeforeMove, 'c3d5', fenAfterMove);

      expect(motif.theme).toBe('fork');
      expect(motif.confidence).toBe(0.90);
      expect(motif.explanation).toContain('Fork');
    });

    it('classifies pin when a sliding piece pins enemy piece against king or higher value piece', () => {
      // White Bishop on c1 moves to g5, pinning Black Knight on f6 to Queen on d8
      const fenBefore = 'r1bqk2r/pppp1ppp/2n2n2/4p3/1b2P3/2NP1N2/PPP2PPP/R1BQKB1R w KQkq - 0 1';
      const fenAfter = 'r1bqk2r/pppp1ppp/2n2n2/4p1B1/1b2P3/2NP1N2/PPP2PPP/R2QKB1R b KQkq - 1 1';
      const motif = classifyTacticalMotif(fenBefore, 'c1g5', fenAfter);

      expect(motif.theme).toBe('pin');
      expect(motif.confidence).toBe(0.88);
      expect(motif.explanation).toContain('Pin');
    });

    it('classifies skewer when a sliding piece attacks a king with high piece behind it', () => {
      // White Rook moves to e1+ skewering Black King on e7 and Black Queen on e8
      const fenBefore = '4q3/4k3/8/8/8/8/8/R3K3 w - - 0 1';
      const fenAfter = '4q3/4k3/8/8/8/8/8/4R1K1 b - - 1 1';
      const motif = classifyTacticalMotif(fenBefore, 'a1e1', fenAfter);

      expect(motif.theme).toBe('skewer');
      expect(motif.confidence).toBe(0.88);
      expect(motif.explanation).toContain('Skewer');
    });

    it('classifies greek_gift when bishop sacrifices on h7', () => {
      // Bishop moves to h7
      const fenBefore = 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1';
      const fenAfter = 'r1bq1rk1/ppp2ppB/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQK2R b KQ - 0 1';
      const motif = classifyTacticalMotif(fenBefore, 'd3h7', fenAfter);

      expect(motif.theme).toBe('greek_gift');
      expect(motif.confidence).toBe(0.90);
      expect(motif.explanation).toContain('Greek Gift');
    });

    it('returns fallback motif for invalid FEN without throwing (MIN-008)', () => {
      const motif = classifyTacticalMotif('invalid-fen-1', 'e2e4', 'invalid-fen-2');
      expect(motif.theme).toBe('fork');
      expect(motif.confidence).toBe(0.5);
    });
  });

  describe('generateMistakeRefutation', () => {
    it('detects blunder leading to immediate checkmate (Priority 1)', () => {
      const fen = '6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1';
      // Black King moves to h8, leaving back rank vulnerable to Ra8#
      const refutation = generateMistakeRefutation(fen, { from: 'g8', to: 'h8' });

      expect(refutation).not.toBeNull();
      expect(refutation?.refutationMoveSan).toBe('Ra8#');
      expect(refutation?.punishingActor).toBe('w');
      expect(refutation?.blunderReason).toContain('immediate checkmate');
      expect(refutation?.kidFriendlyExplanation).toContain('checkmate');
      expect(refutation?.threatSquare).toBe('a8');
    });

    it('detects hanging piece blunder (Priority 2)', () => {
      // White blunders Queen into being captured by Black Knight
      const fen = 'r1bqkb1r/pppp1ppp/2n5/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 0 1';
      const refutation = generateMistakeRefutation(fen, { from: 'f3', to: 'f6' });

      expect(refutation).not.toBeNull();
      expect(refutation?.capturedPiece).toBe('q');
      expect(refutation?.blunderReason).toContain('Queen');
      expect(refutation?.kidFriendlyExplanation).toContain('Queen on f6');
      expect(refutation?.threatSquare).toBe('f6');
    });

    it('detects counter-attacking check blunder (Priority 3)', () => {
      const fenCheck = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
      const refutation = generateMistakeRefutation(fenCheck, { from: 'a2', to: 'a3' });
      expect(refutation).not.toBeNull();
      expect(refutation?.punishingActor).toBe('b');
    });

    it('returns null on illegal player move', () => {
      const fen = '8/8/8/8/8/8/8/4K3 w - - 0 1';
      const refutation = generateMistakeRefutation(fen, { from: 'e1', to: 'e8' });
      expect(refutation).toBeNull();
    });

    it('returns null on invalid FEN', () => {
      const refutation = generateMistakeRefutation('not-a-fen', { from: 'e2', to: 'e4' });
      expect(refutation).toBeNull();
    });
  });

  describe('generateKidExplanation', () => {
    const baseMockAnalysis: PuzzleAnalysisResult = {
      initialMaterial: { white: 0, black: 0, net: 0 },
      finalMaterial: { white: 0, black: 0, net: 0 },
      materialDeltaCentipawns: 500,
      netPointsDelta: 5,
      advantageSummary: {
        netCentipawns: 500,
        netPoints: 5,
        formattedAdvantage: '+5 Rook ♜',
        isDecisive: true,
      },
      detectedTheme: 'fork',
      isCheckmate: false,
      isPawnPromotion: false,
      tacticalHeadline: 'Test Puzzle',
      kidFriendlyExplanation: '',
      ruleOfThumb: 'Always look for forks!',
      stepNarratives: [],
    };

    const basePuzzle: Puzzle = {
      id: 'puz_kid_test',
      fen: '8/8/8/8/8/8/8/4K3 w - - 0 1',
      moves: ['e1e2'],
      rating: 800,
      ratingDeviation: 80,
      themes: ['fork'],
      primaryTheme: 'fork',
      difficulty: 'novice',
      title: 'Kid Test',
      tacticalGoal: 'Goal',
      tacticalReward: 'win_rook',
      outcomeAdvantage: '+5 Rook ♜',
      learningSummary: '',
      keyTakeaway: 'Takeaway',
      playerColor: 'w',
      solutionPlies: 1,
    };

    it('returns custom learningSummary if present on puzzle', () => {
      const customPuzzle = { ...basePuzzle, learningSummary: 'Custom kid explanation!' };
      const text = generateKidExplanation(customPuzzle, baseMockAnalysis);
      expect(text).toBe('Custom kid explanation!');
    });

    it('synthesizes checkmate explanation when isCheckmate is true', () => {
      const mateAnalysis = { ...baseMockAnalysis, isCheckmate: true };
      const text = generateKidExplanation(basePuzzle, mateAnalysis);
      expect(text).toContain('Checkmate!');
      expect(text).toContain('👑');
    });

    it('synthesizes fork explanation', () => {
      const text = generateKidExplanation(basePuzzle, { ...baseMockAnalysis, detectedTheme: 'fork' });
      expect(text).toContain('Brilliant fork!');
      expect(text).toContain('+5 Rook ♜');
    });

    it('synthesizes pin explanation', () => {
      const text = generateKidExplanation(basePuzzle, { ...baseMockAnalysis, detectedTheme: 'pin' });
      expect(text).toContain('Masterful pin!');
    });

    it('synthesizes skewer explanation', () => {
      const text = generateKidExplanation(basePuzzle, { ...baseMockAnalysis, detectedTheme: 'skewer' });
      expect(text).toContain('Powerful skewer!');
    });

    it('synthesizes discovered attack explanation', () => {
      const text = generateKidExplanation(basePuzzle, { ...baseMockAnalysis, detectedTheme: 'discovered_check' });
      expect(text).toContain('Sneaky discovered attack!');
    });

    it('synthesizes back rank mate explanation', () => {
      const text = generateKidExplanation(basePuzzle, { ...baseMockAnalysis, detectedTheme: 'back_rank_mate' });
      expect(text).toContain('Back rank checkmate!');
    });

    it('synthesizes smothered mate explanation', () => {
      const text = generateKidExplanation(basePuzzle, { ...baseMockAnalysis, detectedTheme: 'smothered_mate' });
      expect(text).toContain('Smothered mate!');
    });

    it('synthesizes default fallback explanation for unknown theme', () => {
      const text = generateKidExplanation(basePuzzle, { ...baseMockAnalysis, detectedTheme: 'hanging_piece' });
      expect(text).toContain('Great tactical vision!');
    });
  });

  describe('generateStepBreakdowns', () => {
    it('generates breakdowns for valid puzzle moves', () => {
      const puzzle: Puzzle = {
        id: 'step_test',
        fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
        moves: ['a1a8'],
        rating: 700,
        ratingDeviation: 100,
        themes: ['back_rank_mate'],
        primaryTheme: 'back_rank_mate',
        difficulty: 'novice',
        title: 'Mate in 1',
        tacticalGoal: 'Mate',
        tacticalReward: 'checkmate',
        outcomeAdvantage: 'Checkmate 👑',
        learningSummary: 'Mate',
        keyTakeaway: 'Mate',
        playerColor: 'w',
        solutionPlies: 1,
      };
      const steps = generateStepBreakdowns(puzzle);
      expect(steps).toHaveLength(1);
      expect(steps[0]?.moveSan).toBe('Ra8#');
    });

    it('returns empty array for invalid FEN or empty moves', () => {
      const basePuzzle: Puzzle = {
        id: 'puz_empty',
        fen: '8/8/8/8/8/8/8/4K3 w - - 0 1',
        moves: [],
        rating: 800,
        ratingDeviation: 80,
        themes: ['fork'],
        primaryTheme: 'fork',
        difficulty: 'novice',
        title: 'Empty',
        tacticalGoal: 'N/A',
        tacticalReward: 'win_minor_piece',
        outcomeAdvantage: '+3 Piece',
        learningSummary: '',
        keyTakeaway: '',
        playerColor: 'w',
        solutionPlies: 0,
      };
      expect(generateStepBreakdowns(basePuzzle)).toEqual([]);
      expect(generateStepBreakdowns({ ...basePuzzle, moves: ['e1e2'], fen: 'invalid-fen' })).toEqual([]);
    });
  });

  describe('Material Delta and Piece Counting Utilities', () => {
    it('counts color material and piece counts accurately', () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      expect(calculateColorMaterial(fen, 'w')).toBe(4000);
      expect(calculateColorMaterial(fen, 'b')).toBe(4000);

      const counts = getPieceCounts(fen, 'w');
      expect(counts.p).toBe(8);
      expect(counts.r).toBe(2);
      expect(counts.n).toBe(2);
      expect(counts.b).toBe(2);
      expect(counts.q).toBe(1);
      expect(counts.k).toBe(1);
    });

    it('returns 0 for invalid FEN in calculateColorMaterial and getPieceCounts', () => {
      expect(calculateColorMaterial('invalid-fen', 'w')).toBe(0);
      const counts = getPieceCounts('invalid-fen', 'w');
      expect(counts.p).toBe(0);
    });

    it('returns fallback MaterialAdvantageSummary for invalid FEN in calculateMaterialDelta', () => {
      const delta = calculateMaterialDelta('bad-fen-1', 'bad-fen-2', 'w');
      expect(delta.netPoints).toBe(0);
      expect(delta.formattedAdvantage).toBe('Positional Advantage ⚡');
    });

    it('calculates material counts using calculateBoardMaterial and shared piece point constants (MAJ-035)', () => {
      expect(PIECE_CENTIPAWN_VALUES.q).toBe(900);
      expect(PIECE_CENTIPAWN_VALUES.p).toBe(100);
      expect(STANDARD_PIECE_POINTS.q).toBe(9);
      expect(STANDARD_PIECE_POINTS.p).toBe(1);

      const chess = createSafeChess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      const mat = getMaterialCount(chess);
      expect(mat.white).toBe(4000);
      expect(mat.black).toBe(4000);
      expect(mat.net).toBe(0);
    });

    it('returns zeroes when getPieceCounts encounters an error (MAJ-010)', () => {
      const validFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      vi.spyOn(Chess.prototype, 'board').mockImplementationOnce(() => {
        throw new Error('simulated board parsing failure');
      });

      const counts = getPieceCounts(validFen, 'w');
      expect(counts.p).toBe(0);
      expect(counts.q).toBe(0);
    });

    it('returns zero when calculateColorMaterial encounters an error (MAJ-010)', () => {
      const validFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      vi.spyOn(Chess.prototype, 'board').mockImplementationOnce(() => {
        throw new Error('simulated board parsing failure');
      });

      const total = calculateColorMaterial(validFen, 'w');
      expect(total).toBe(0);
    });
  });


  describe('analyzePuzzleSolution Resilience', () => {
    it('safely handles malformed puzzle FEN without throwing', () => {
      const badPuzzle: Puzzle = {
        id: 'bad_fen_puzzle',
        fen: 'not-a-valid-chess-fen',
        moves: ['e2e4'],
        rating: 1000,
        ratingDeviation: 100,
        themes: ['fork'],
        primaryTheme: 'fork',
        difficulty: 'novice',
        title: 'Corrupted Puzzle',
        tacticalGoal: 'N/A',
        tacticalReward: 'win_minor_piece',
        outcomeAdvantage: '+3 Piece',
        learningSummary: 'N/A',
        keyTakeaway: 'N/A',
        playerColor: 'w',
        solutionPlies: 1,
      };

      const result = analyzePuzzleSolution(badPuzzle);
      expect(result).toBeDefined();
      expect(result.initialMaterial.white).toBe(0);
      expect(result.materialDeltaCentipawns).toBe(0);
      expect(result.detectedTheme).toBe('fork');
    });

    it('handles simulation break when move in puzzle is invalid', () => {
      const badMovePuzzle: Puzzle = {
        id: 'bad_move_puzzle',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: ['e2e5'], // Illegal move in starting position
        rating: 1000,
        ratingDeviation: 100,
        themes: ['hanging_piece'],
        primaryTheme: 'hanging_piece',
        difficulty: 'novice',
        title: 'Illegal Move Puzzle',
        tacticalGoal: 'N/A',
        tacticalReward: 'win_pawn',
        outcomeAdvantage: '+1 Pawn ♟️',
        learningSummary: 'Test',
        keyTakeaway: 'Test',
        playerColor: 'w',
        solutionPlies: 1,
      };

      const result = analyzePuzzleSolution(badMovePuzzle);
      expect(result).toBeDefined();
      expect(result.isCheckmate).toBe(false);
    });
  });

  describe('PuzzleAnalysisEngine Class Instance', () => {
    it('implements PuzzleAnalysisEngineService methods via singleton', () => {
      const engine = new PuzzleAnalysisEngine();
      expect(engine.classifyTacticalMotif).toBeDefined();
      expect(engine.generateMistakeRefutation).toBeDefined();
      expect(engine.generateKidExplanation).toBeDefined();
      expect(engine.generateStepBreakdowns).toBeDefined();
      expect(engine.analyzePuzzleSolution).toBeDefined();
      expect(engine.calculateMaterialDelta).toBeDefined();
      expect(puzzleAnalysisEngine).toBeInstanceOf(PuzzleAnalysisEngine);
    });
  });
});
