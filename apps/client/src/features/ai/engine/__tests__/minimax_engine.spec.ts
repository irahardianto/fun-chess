import { describe, it, expect } from 'vitest';
import { Chess, type Move } from 'chess.js';
import type { AiSearchConfig } from '@fun-chess/shared';
import {
  MinimaxEngine,
  minimaxEngine,
  scoreMoveForOrdering,
  orderMoves,
} from '../minimax_engine.js';

describe('Minimax Search Engine (Alpha-Beta Search & Tactics)', () => {
  const engine = new MinimaxEngine();

  const fastConfig: AiSearchConfig = {
    depth: 2,
    blunderChance: 0,
    maxBlunderScoreDrop: 0,
    evaluationNoise: 0,
    usePst: true,
    useQuiescence: true,
    simulatedThinkTimeMs: [0, 0],
  };

  describe('Move Ordering & MVV-LVA Heuristics', () => {
    it('prioritizes MVV-LVA captures over quiet moves and low-value captures', () => {
      const chess = new Chess('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
      const moves = chess.moves({ verbose: true });
      const ordered = orderMoves(moves);

      const nxe5 = ordered.find((m) => m.from === 'f3' && m.to === 'e5');
      const quietPawn = ordered.find((m) => m.from === 'd2' && m.to === 'd3');

      expect(nxe5).toBeDefined();
      expect(quietPawn).toBeDefined();
      if (nxe5 && quietPawn) {
        expect(scoreMoveForOrdering(nxe5)).toBeGreaterThan(scoreMoveForOrdering(quietPawn));
      }
    });

    it('scores Least Valuable Attacker higher when capturing high-value targets', () => {
      // White has Pawn and Queen that can capture Black Queen
      // Pawn x Queen (MVV-LVA: 900*10 - 100 + 10000 = 18900)
      // Queen x Queen (MVV-LVA: 900*10 - 900 + 10000 = 18100)
      const pawnCapturesQueen = {
        piece: 'p' as const,
        captured: 'q' as const,
        san: 'exd4',
        from: 'e3',
        to: 'd4',
        color: 'w' as const,
        flags: 'c',
      } as unknown as Move;
      const queenCapturesQueen = {
        piece: 'q' as const,
        captured: 'q' as const,
        san: 'Qxd4',
        from: 'd1',
        to: 'd4',
        color: 'w' as const,
        flags: 'c',
      } as unknown as Move;

      expect(scoreMoveForOrdering(pawnCapturesQueen)).toBeGreaterThan(
        scoreMoveForOrdering(queenCapturesQueen),
      );
    });

    it('scores promotion moves higher than non-promotion quiet moves', () => {
      const promoMove = {
        piece: 'p' as const,
        promotion: 'q' as const,
        san: 'e8=Q',
        from: 'e7',
        to: 'e8',
        color: 'w' as const,
        flags: 'p',
      } as unknown as Move;
      const quietMove = {
        piece: 'n' as const,
        san: 'Nf3',
        from: 'g1',
        to: 'f3',
        color: 'w' as const,
        flags: 'n',
      } as unknown as Move;

      expect(scoreMoveForOrdering(promoMove)).toBeGreaterThan(scoreMoveForOrdering(quietMove));
    });
  });

  describe('Tactical Problem Solving & Mate Detection', () => {
    it('detects Mate-in-1 for White (Scholar\'s Mate finish: Qxf7#)', async () => {
      // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
      const fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
      const evaluation = await engine.findBestMove(fen, {
        ...fastConfig,
        depth: 2,
      });

      expect(evaluation.move.from).toBe('h5');
      expect(evaluation.move.to).toBe('f7');
      expect(evaluation.isBlunder).toBe(false);
      expect(evaluation.nodesEvaluated).toBeGreaterThan(0);
      expect(evaluation.score).toBeGreaterThan(90000); // Checkmate score range
    });

    it('detects Mate-in-1 for Black (Fool\'s Mate finish: Qh4#)', async () => {
      // 1.f3 e5 2.g4 Qh4#
      const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
      const evaluation = await engine.findBestMove(fen, {
        ...fastConfig,
        depth: 2,
      });

      expect(evaluation.move.from).toBe('d8');
      expect(evaluation.move.to).toBe('h4');
      expect(evaluation.isBlunder).toBe(false);
    });

    it('immediately captures hanging high-value enemy piece (Queen capture)', async () => {
      // Black left Queen on d4 unguarded, White Knight on f3 can capture it (Nxd4)
      const fen = 'rnb1kbnr/pppp1ppp/8/8/3q4/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1';
      const evaluation = await engine.findBestMove(fen, {
        ...fastConfig,
        depth: 2,
      });

      expect(evaluation.move.from).toBe('f3');
      expect(evaluation.move.to).toBe('d4');
      expect(evaluation.isBlunder).toBe(false);
    });
  });

  describe('Search Engine Interfaces & Constraints', () => {
    it('evaluates static positions directly via evaluatePosition', () => {
      const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const score = engine.evaluatePosition(startFen);
      expect(score).toBe(0);
    });

    it('throws descriptive error when no legal moves exist (terminal state)', async () => {
      const matedFen = 'r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
      await expect(engine.findBestMove(matedFen, fastConfig)).rejects.toThrow(
        'No legal moves available',
      );
    });

    it('operates via singleton minimaxEngine instance', async () => {
      expect(minimaxEngine).toBeInstanceOf(MinimaxEngine);
      const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const evalResult = await minimaxEngine.findBestMove(startFen, {
        ...fastConfig,
        depth: 1,
      });
      expect(evalResult.move).toBeDefined();
      expect(evalResult.depth).toBe(1);
    });

    it('respects simulated think time range when configured', async () => {
      const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const start = performance.now();
      await engine.findBestMove(startFen, {
        ...fastConfig,
        depth: 1,
        simulatedThinkTimeMs: [50, 80],
      });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });
});
