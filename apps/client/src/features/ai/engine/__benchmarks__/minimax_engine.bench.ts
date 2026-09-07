import { bench, describe } from 'vitest';
import { Chess } from 'chess.js';
import { MinimaxEngine } from '../minimax_engine.js';
import { evaluateBoard } from '../pst_evaluator.js';
import type { AiSearchConfig } from '@fun-chess/shared';

describe('Minimax Chess AI Engine Benchmark', () => {
  const engine = new MinimaxEngine();

  const fastConfigDepth2: AiSearchConfig = {
    depth: 2,
    blunderChance: 0,
    maxBlunderScoreDrop: 0,
    evaluationNoise: 0,
    usePst: true,
    useQuiescence: true,
    simulatedThinkTimeMs: [0, 0],
  };

  const fastConfigDepth3: AiSearchConfig = {
    depth: 3,
    blunderChance: 0,
    maxBlunderScoreDrop: 0,
    evaluationNoise: 0,
    usePst: true,
    useQuiescence: true,
    simulatedThinkTimeMs: [0, 0],
  };

  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const tacticalFen = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  const complexMiddlegameFen = 'r1b2rk1/pp1p1ppp/2n1pn2/q7/2PP4/2NB1N2/PP1Q1PPP/R3K2R w KQ - 4 10';

  const testChess = new Chess(complexMiddlegameFen);

  bench('evaluateBoard static evaluation (complex middlegame)', () => {
    evaluateBoard(testChess, true);
  });

  bench('findBestMove - Tactical Position (Depth 2)', async () => {
    await engine.findBestMove(tacticalFen, fastConfigDepth2);
  });

  bench('findBestMove - Opening Position (Depth 2)', async () => {
    await engine.findBestMove(startFen, fastConfigDepth2);
  });

  bench(
    'findBestMove - Complex Middlegame (Depth 3)',
    async () => {
      await engine.findBestMove(complexMiddlegameFen, fastConfigDepth3);
    },
    { iterations: 1, warmupIterations: 0 },
  );
});
