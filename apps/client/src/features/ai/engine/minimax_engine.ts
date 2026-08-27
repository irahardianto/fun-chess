import { Chess, type Move } from 'chess.js';
import type {
  Square,
  AiSearchConfig,
  AiMoveEvaluation,
  ChessAiEngine,
} from '@fun-chess/shared';
import { createSafeChess } from '@fun-chess/shared';
import { PIECE_VALUES } from './piece_square_tables.js';
import {
  evaluateBoard,
  evaluateFen,
  CHECKMATE_SCORE,
  STALEMATE_SCORE,
} from './pst_evaluator.js';
import {
  chooseFinalMove,
  type EvaluatedCandidateMove,
} from './blunder_generator.js';

interface SearchState {
  nodesEvaluated: number;
}

const DEFAULT_QUIESCENCE_MAX_DEPTH = 3;

/**
 * Assigns an ordering score to a move to maximize alpha-beta cutoffs.
 * Prioritizes MVV-LVA (Most Valuable Victim - Least Valuable Attacker) captures, promotions, and checks.
 */
export function scoreMoveForOrdering(move: Move): number {
  let score = 0;

  // MVV-LVA capture scoring
  if (move.captured) {
    const victimVal = PIECE_VALUES[move.captured] ?? 0;
    const attackerVal = PIECE_VALUES[move.piece] ?? 0;
    score += victimVal * 10 - attackerVal + 10000;
  }

  // Promotion bonus
  if (move.promotion) {
    const promoVal = PIECE_VALUES[move.promotion] ?? 0;
    score += promoVal + 8000;
  }

  // Check / San indicator bonus
  if (move.san.includes('+') || move.san.includes('#')) {
    score += 500;
  }

  return score;
}

/**
 * Orders moves descending by ordering score.
 */
export function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));
}

/**
 * Quiescence search to evaluate tactical captures at leaf nodes.
 */
function quiescenceSearch(
  chess: Chess,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  usePst: boolean,
  state: SearchState,
  qDepth: number,
): number {
  state.nodesEvaluated++;

  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -CHECKMATE_SCORE : CHECKMATE_SCORE;
  }
  if (chess.isDraw()) {
    return STALEMATE_SCORE;
  }

  const standPat = evaluateBoard(chess, usePst);

  if (qDepth <= 0) {
    return standPat;
  }

  if (isMaximizing) {
    if (standPat >= beta) return beta;
    let localAlpha = Math.max(alpha, standPat);

    const captureMoves = orderMoves(
      chess.moves({ verbose: true }).filter((m) => !!m.captured),
    );

    for (const move of captureMoves) {
      chess.move(move);
      const score = quiescenceSearch(
        chess,
        localAlpha,
        beta,
        false,
        usePst,
        state,
        qDepth - 1,
      );
      chess.undo();

      if (score >= beta) return beta;
      localAlpha = Math.max(localAlpha, score);
    }
    return localAlpha;
  } else {
    if (standPat <= alpha) return alpha;
    let localBeta = Math.min(beta, standPat);

    const captureMoves = orderMoves(
      chess.moves({ verbose: true }).filter((m) => !!m.captured),
    );

    for (const move of captureMoves) {
      chess.move(move);
      const score = quiescenceSearch(
        chess,
        alpha,
        localBeta,
        true,
        usePst,
        state,
        qDepth - 1,
      );
      chess.undo();

      if (score <= alpha) return alpha;
      localBeta = Math.min(localBeta, score);
    }
    return localBeta;
  }
}

/**
 * Minimax recursive search with Alpha-Beta pruning.
 */
function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  config: AiSearchConfig,
  state: SearchState,
): number {
  state.nodesEvaluated++;

  if (chess.isCheckmate()) {
    // Prefer faster mates by factoring in depth remaining
    return chess.turn() === 'w'
      ? -CHECKMATE_SCORE - depth
      : CHECKMATE_SCORE + depth;
  }

  if (chess.isDraw()) {
    return STALEMATE_SCORE;
  }

  if (depth <= 0) {
    if (config.useQuiescence) {
      return quiescenceSearch(
        chess,
        alpha,
        beta,
        isMaximizing,
        config.usePst,
        state,
        DEFAULT_QUIESCENCE_MAX_DEPTH,
      );
    }
    return evaluateBoard(chess, config.usePst);
  }

  const legalMoves = orderMoves(chess.moves({ verbose: true }));

  if (legalMoves.length === 0) {
    return evaluateBoard(chess, config.usePst);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    let localAlpha = alpha;

    for (const move of legalMoves) {
      chess.move(move);
      const evaluation = minimax(
        chess,
        depth - 1,
        localAlpha,
        beta,
        false,
        config,
        state,
      );
      chess.undo();

      maxEval = Math.max(maxEval, evaluation);
      localAlpha = Math.max(localAlpha, evaluation);
      if (beta <= localAlpha) {
        break; // Beta cutoff
      }
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    let localBeta = beta;

    for (const move of legalMoves) {
      chess.move(move);
      const evaluation = minimax(
        chess,
        depth - 1,
        alpha,
        localBeta,
        true,
        config,
        state,
      );
      chess.undo();

      minEval = Math.min(minEval, evaluation);
      localBeta = Math.min(localBeta, evaluation);
      if (localBeta <= alpha) {
        break; // Alpha cutoff
      }
    }
    return minEval;
  }
}

/**
 * Pure Minimax / Alpha-Beta Chess AI Engine.
 */
export class MinimaxEngine implements ChessAiEngine {
  /**
   * Evaluates the current FEN position statically in centipawns.
   */
  evaluatePosition(fen: string): number {
    return evaluateFen(fen);
  }

  /**
   * Finds the best move from the given FEN position applying calibrated depth, blunder chance, and noise.
   */
  async findBestMove(fen: string, config: AiSearchConfig): Promise<AiMoveEvaluation> {
    const startTime = performance.now();
    const chess = createSafeChess(fen);
    const state: SearchState = { nodesEvaluated: 0 };
    const turn = chess.turn(); // 'w' or 'b'
    const isMaximizing = turn === 'w';

    const legalMoves = orderMoves(chess.moves({ verbose: true }));

    if (legalMoves.length === 0) {
      throw new Error(`No legal moves available in position: ${fen}`);
    }

    const candidateMoves: EvaluatedCandidateMove[] = [];
    const searchDepth = Math.max(1, config.depth);

    for (const move of legalMoves) {
      chess.move(move);
      const score = minimax(
        chess,
        searchDepth - 1,
        -Infinity,
        Infinity,
        !isMaximizing,
        config,
        state,
      );
      chess.undo();

      // aiScore is always higher-is-better for the active player
      const aiScore = isMaximizing ? score : -score;

      candidateMoves.push({
        move: {
          from: move.from as Square,
          to: move.to as Square,
          ...(move.promotion ? { promotion: move.promotion as 'q' | 'r' | 'b' | 'n' } : {}),
        },
        score,
        aiScore,
      });
    }

    const { selected, isBlunder } = chooseFinalMove(candidateMoves, config);

    const calculationDuration = performance.now() - startTime;

    // Emulate simulated think time if requested
    const [minThinkMs, maxThinkMs] = config.simulatedThinkTimeMs;
    if (maxThinkMs > 0) {
      const targetThinkMs = minThinkMs + Math.random() * (maxThinkMs - minThinkMs);
      const remainingDelay = Math.max(0, targetThinkMs - calculationDuration);
      if (remainingDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingDelay));
      }
    }

    const totalDuration = performance.now() - startTime;

    return {
      move: selected.move,
      score: selected.score,
      depth: searchDepth,
      nodesEvaluated: state.nodesEvaluated,
      isBlunder,
      searchDurationMs: Math.round(totalDuration),
    };
  }
}

/**
 * Singleton instance of MinimaxEngine for direct use.
 */
export const minimaxEngine = new MinimaxEngine();
