import { describe, it, expect } from 'vitest';
import type { Puzzle } from '@fun-chess/shared';
import {
  calculateMaterialDelta,
  classifyTacticalMotif,
  generateMistakeRefutation,
  generateStepBreakdowns,
  analyzePuzzleSolution,
  puzzleAnalysisEngine,
  getMaterialCount,
} from '../puzzle_analysis_engine';
import { Chess, type Square } from 'chess.js';

describe('PuzzleAnalysisEngine', () => {
  // Royal Knight Fork: White plays c3b5, Black plays e8d8, White plays b5c7 winning rook on a8
  const forkPuzzle: Puzzle = {
    id: 'puz_fork_001',
    fen: 'r3k2r/ppp2ppp/2n1pn2/3p4/3P4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
    moves: ['c3b5', 'e8d8', 'b5c7', 'd8e7', 'c7a8'],
    rating: 850,
    ratingDeviation: 100,
    themes: ['fork'],
    primaryTheme: 'fork',
    difficulty: 'novice',
    title: 'The Royal Knight Leap! ♞',
    tacticalGoal: 'Fork the King and Rook on c7 to win decisive material!',
    tacticalReward: 'win_rook',
    outcomeAdvantage: '+5 Rook ♜',
    learningSummary: '1. Nb5 threatened c7. 2. Nxc7+ forked King and Rook, winning the undefended Rook on a8!',
    keyTakeaway: 'Knights are master forkers because they can leap over defenders!',
    playerColor: 'w',
    solutionPlies: 5,
  };

  // Back Rank Mate
  const backRankPuzzle: Puzzle = {
    id: 'puz_backrank_001',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    moves: ['a1a8'],
    rating: 700,
    ratingDeviation: 100,
    themes: ['back_rank_mate', 'mate_in_1'],
    primaryTheme: 'back_rank_mate',
    difficulty: 'novice',
    title: 'Back Rank Elevator 👑',
    tacticalGoal: 'Deliver back-rank checkmate to the trapped King!',
    tacticalReward: 'checkmate',
    outcomeAdvantage: 'Checkmate 👑',
    learningSummary: 'The Black King was trapped behind its own pawns. Ra8# delivered instant checkmate!',
    keyTakeaway: 'Always keep an eye on the back rank when pawns have not moved!',
    playerColor: 'w',
    solutionPlies: 1,
  };

  describe('Material Delta Calculation', () => {
    it('calculates net material gain for checkmate positions', () => {
      const summary = calculateMaterialDelta(backRankPuzzle.fen, 'R5k1/5ppp/8/8/8/8/8/4K3 b - - 1 1', 'w', true);
      expect(summary.isDecisive).toBe(true);
      expect(summary.formattedAdvantage).toBe('Checkmate 👑');
      expect(summary.netPoints).toBe(Infinity);
    });

    it('calculates +5 Rook advantage correctly on fork puzzle final FEN', () => {
      // Initial: White and Black have standard pieces
      // Final: Black has lost a pawn on c7 (100) and rook on a8 (500) = 600 cp total
      const chess = new Chess(forkPuzzle.fen);
      for (const m of forkPuzzle.moves) {
        const from = m.slice(0, 2);
        const to = m.slice(2, 4);
        chess.move({ from: from as Square, to: to as Square });
      }
      const finalFen = chess.fen();

      const summary = calculateMaterialDelta(forkPuzzle.fen, finalFen, 'w');
      expect(summary.netCentipawns).toBe(600);
      expect(summary.netPoints).toBe(5);
      expect(summary.formattedAdvantage).toBe('+5 Rook ♜');
      expect(summary.pieceType).toBe('r');
      expect(summary.isDecisive).toBe(true);
    });

    it('calculates material advantage symmetrically for Black player perspective', () => {
      // Initial: equal material
      const initFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
      // Final: White lost a Queen
      const finalFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1';
      const summary = calculateMaterialDelta(initFen, finalFen, 'b');
      expect(summary.netCentipawns).toBe(900);
      expect(summary.netPoints).toBe(9);
      expect(summary.formattedAdvantage).toBe('+9 Queen ♛');
      expect(summary.isDecisive).toBe(true);
    });

    it('identifies +3 piece gain, +2 exchange, and +1 pawn gains', () => {
      const initFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      // White captures minor piece
      const minorFen = 'r1bqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const minorSummary = calculateMaterialDelta(initFen, minorFen, 'w');
      expect(minorSummary.netPoints).toBe(3);
      expect(minorSummary.formattedAdvantage).toBe('+3 Piece (Bishop/Knight) ⚔️');

      // White captures pawn
      const pawnFen = 'rnbqkbnr/ppppppp1/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const pawnSummary = calculateMaterialDelta(initFen, pawnFen, 'w');
      expect(pawnSummary.netPoints).toBe(1);
      expect(pawnSummary.formattedAdvantage).toBe('+1 Pawn ♟️');
    });

    it('returns positional advantage when material delta is zero or negative', () => {
      const initFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const summary = calculateMaterialDelta(initFen, initFen, 'w');
      expect(summary.netPoints).toBe(0);
      expect(summary.formattedAdvantage).toBe('Positional Advantage ⚡');
      expect(summary.isDecisive).toBe(false);
    });
  });

  describe('Tactical Motif Classification', () => {
    it('classifies back-rank checkmate', () => {
      const motif = classifyTacticalMotif(backRankPuzzle.fen, 'a1a8', 'R5k1/5ppp/8/8/8/8/8/4K3 b - - 1 1');
      expect(motif.theme).toBe('back_rank_mate');
      expect(motif.confidence).toBeGreaterThanOrEqual(0.9);
      expect(motif.explanation).toContain('Back rank');
    });

    it('classifies knight fork attacking king and rook', () => {
      // Position before d5c7
      const fenBefore = 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1';
      const fenAfter = 'r3k2r/ppN2ppp/8/8/8/8/PPP2PPP/R3K2R b KQkq - 1 1';
      const motif = classifyTacticalMotif(fenBefore, 'd5c7', fenAfter);
      expect(motif.theme).toBe('fork');
      expect(motif.confidence).toBeGreaterThanOrEqual(0.85);
      expect(motif.explanation).toContain('Fork');
    });

    it('classifies discovered check and double check', () => {
      // Discovered check setup: White King e1, White Rook e2, White Knight e4, Black King e8
      const fenBefore = '4k3/8/8/8/4N3/8/4R3/4K3 w - - 0 1';
      // Knight moves to d6 (double check!) or f6 (double check) or c5 (discovered check)
      const fenDisc = '4k3/8/8/2N5/8/8/4R3/4K3 b - - 1 1';
      const motif = classifyTacticalMotif(fenBefore, 'e4c5', fenDisc);
      expect(motif.theme).toBe('discovered_check');
    });

    it('classifies pawn promotion', () => {
      const fenBefore = '8/4P3/8/8/8/4k3/8/6K1 w - - 0 1';
      const fenAfter = '4Q3/8/8/8/8/4k3/8/6K1 b - - 0 1';
      const motif = classifyTacticalMotif(fenBefore, 'e7e8q', fenAfter);
      expect(motif.theme).toBe('pawn_endgame');
    });
  });

  describe('Mistake Refutation Analysis', () => {
    it('generates checkmate refutation when player blunders into mate', () => {
      // Black king on g8 with pawns on f7, g7, h7. White rook on a1.
      const fen = '6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1';
      // Black blunders king to h8 allowing Ra8#
      const refutation = generateMistakeRefutation(fen, { from: 'g8', to: 'h8' });

      expect(refutation).not.toBeNull();
      expect(refutation?.refutationMoveSan).toBe('Ra8#');
      expect(refutation?.blunderReason).toContain('immediate checkmate');
      expect(refutation?.kidFriendlyExplanation).toContain('checkmate');
      expect(refutation?.threatSquare).toBe('a8');
    });

    it('generates hanging piece refutation when player leaves queen unprotected', () => {
      // White moves queen to undefended square attacked by black knight
      const fen = 'r1bqkb1r/pppp1ppp/2n5/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 0 1';
      // White moves Queen f3 to a8 (illegal) or f3 to e3 (safe) or f3 to f6 (captured by pawn)
      const refutation = generateMistakeRefutation(fen, { from: 'f3', to: 'f6' });

      expect(refutation).not.toBeNull();
      expect(refutation?.capturedPiece).toBe('q');
      expect(refutation?.blunderReason).toContain('Queen');
      expect(refutation?.threatSquare).toBe('f6');
    });

    it('returns null when player move is illegal on board', () => {
      const fen = '8/8/8/8/8/8/8/4K3 w - - 0 1';
      const refutation = generateMistakeRefutation(fen, { from: 'a1', to: 'a8' });
      expect(refutation).toBeNull();
    });
  });

  describe('Step Breakdown & Explanation Synthesis', () => {
    it('generates complete step breakdown for multi-ply puzzle', () => {
      const steps = generateStepBreakdowns(forkPuzzle);
      expect(steps).toHaveLength(5);
      expect(steps[0]?.moveUci).toBe('c3b5');
      expect(steps[0]?.actor).toBe('w');
      expect(steps[1]?.moveUci).toBe('e8d8');
      expect(steps[1]?.actor).toBe('b');
      expect(steps[2]?.moveUci).toBe('b5c7');
      expect(steps[4]?.moveUci).toBe('c7a8');
    });

    it('synthesizes kid-friendly explanations according to theme', () => {
      const analysis = analyzePuzzleSolution(forkPuzzle);
      expect(analysis.kidFriendlyExplanation).toBe(forkPuzzle.learningSummary);
      expect(analysis.ruleOfThumb).toBe(forkPuzzle.keyTakeaway);
      expect(analysis.tacticalHeadline).toBe(forkPuzzle.title);
    });
  });

  describe('Full analyzePuzzleSolution Integration', () => {
    it('generates complete analysis for fork puzzle', () => {
      const analysis = analyzePuzzleSolution(forkPuzzle);

      expect(analysis.initialMaterial.white).toBe(getMaterialCount(new Chess(forkPuzzle.fen)).white);
      expect(analysis.materialDeltaCentipawns).toBe(600);
      expect(analysis.netPointsDelta).toBe(5);
      expect(analysis.advantageSummary.formattedAdvantage).toBe('+5 Rook ♜');
      expect(analysis.advantageSummary.isDecisive).toBe(true);
      expect(analysis.isCheckmate).toBe(false);
      expect(analysis.stepNarratives).toHaveLength(5);
      expect(analysis.ruleOfThumb).toContain('Knights are master forkers');
    });

    it('generates complete analysis for checkmate puzzle', () => {
      const analysis = analyzePuzzleSolution(backRankPuzzle);

      expect(analysis.isCheckmate).toBe(true);
      expect(analysis.advantageSummary.formattedAdvantage).toBe('Checkmate 👑');
      expect(analysis.advantageSummary.isDecisive).toBe(true);
      expect(analysis.detectedTheme).toBe('back_rank_mate');
    });

    it('adheres to PuzzleAnalysisEngineService interface via singleton instance', () => {
      const result = puzzleAnalysisEngine.analyzePuzzleSolution(backRankPuzzle);
      expect(result.isCheckmate).toBe(true);

      const delta = puzzleAnalysisEngine.calculateMaterialDelta(backRankPuzzle.fen, 'R5k1/5ppp/8/8/8/8/8/4K3 b - - 1 1', 'w');
      expect(delta.formattedAdvantage).toBe('Checkmate 👑');

      const steps = puzzleAnalysisEngine.generateStepBreakdowns(forkPuzzle);
      expect(steps.length).toBe(5);
    });
  });
});
