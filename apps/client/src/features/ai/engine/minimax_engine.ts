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

declare module '@fun-chess/shared' {
  interface AiSearchConfig {
    readonly timeoutMs?: number;
    readonly deadlineMs?: number;
    readonly maxNodes?: number;
  }
}

interface TranspositionEntry {
  depth: number;
  score: number;
  flag: 'exact' | 'lower' | 'upper';
}

interface SearchState {
  nodesEvaluated: number;
  tt?: Map<string, TranspositionEntry>;
  deadline?: number;
  maxNodes?: number;
  aborted?: boolean;
}

/**
 * Checks if search limits (deadline or max nodes) have been reached.
 */
function checkSearchAborted(state: SearchState): boolean {
  if (state.aborted) {
    return true;
  }
  if (state.maxNodes !== undefined && state.nodesEvaluated >= state.maxNodes) {
    state.aborted = true;
    return true;
  }
  if (state.deadline !== undefined) {
    // Check periodically every 32 nodes or on the initial node to bound performance.now() overhead
    if ((state.nodesEvaluated & 31) === 0 || state.nodesEvaluated === 1) {
      if (performance.now() >= state.deadline) {
        state.aborted = true;
        return true;
      }
    }
  }
  return false;
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
  // PERF: Checking last character avoids regex / substring scanning
  const lastChar = move.san[move.san.length - 1];
  if (lastChar === '+' || lastChar === '#') {
    score += 500;
  }

  return score;
}

/**
 * Orders moves descending by ordering score.
 * PERF: Schwartzian transform pre-scores each move in O(N) rather than recalculating O(N log N) times inside sort comparator.
 */
export function orderMoves(moves: Move[]): Move[] {
  if (moves.length <= 1) return moves;
  const scored = new Array(moves.length);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]!;
    scored[i] = { move: m, score: scoreMoveForOrdering(m) };
  }
  scored.sort((a, b) => b.score - a.score);
  const result = new Array(moves.length);
  for (let i = 0; i < moves.length; i++) {
    result[i] = scored[i]!.move;
  }
  return result;
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

  if (checkSearchAborted(state)) {
    return evaluateBoard(chess, usePst);
  }

  // PERF: Checkmate is only possible if in check; avoids expensive moves() generation in leaf states
  const inCheck = chess.inCheck();
  if (inCheck && chess.isCheckmate()) {
    return chess.turn() === 'w' ? -CHECKMATE_SCORE : CHECKMATE_SCORE;
  }

  const standPat = evaluateBoard(chess, usePst);

  if (qDepth <= 0) {
    return standPat;
  }

  if (isMaximizing) {
    // PERF: Standing pat cutoff before generating legal capture moves
    if (standPat >= beta) return beta;
    let localAlpha = Math.max(alpha, standPat);

    const allMoves = chess.moves({ verbose: true });
    const captures: Move[] = [];
    for (let i = 0; i < allMoves.length; i++) {
      const m = allMoves[i]!;
      if (m.captured) captures.push(m);
    }
    if (captures.length === 0) return localAlpha;

    const captureMoves = orderMoves(captures);

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

      if (state.aborted) {
        break;
      }

      if (score >= beta) return beta;
      localAlpha = Math.max(localAlpha, score);
    }
    return localAlpha;
  } else {
    // PERF: Standing pat cutoff before generating legal capture moves
    if (standPat <= alpha) return alpha;
    let localBeta = Math.min(beta, standPat);

    const allMoves = chess.moves({ verbose: true });
    const captures: Move[] = [];
    for (let i = 0; i < allMoves.length; i++) {
      const m = allMoves[i]!;
      if (m.captured) captures.push(m);
    }
    if (captures.length === 0) return localBeta;

    const captureMoves = orderMoves(captures);

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

      if (state.aborted) {
        break;
      }

      if (score <= alpha) return alpha;
      localBeta = Math.min(localBeta, score);
    }
    return localBeta;
  }
}

/**
 * Minimax recursive search with Alpha-Beta pruning and Transposition Table.
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

  if (checkSearchAborted(state)) {
    return evaluateBoard(chess, config.usePst);
  }

  // PERF: Transposition table lookup
  const fenKey = state.tt ? chess.fen() : '';
  if (state.tt && fenKey) {
    const entry = state.tt.get(fenKey);
    if (entry && entry.depth >= depth) {
      if (entry.flag === 'exact') return entry.score;
      if (entry.flag === 'lower' && entry.score >= beta) return entry.score;
      if (entry.flag === 'upper' && entry.score <= alpha) return entry.score;
    }
  }

  // PERF: At leaf depth, evaluate directly without generating moves or checkmate tests
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

  // PERF: If no legal moves, check inCheck once to distinguish checkmate from stalemate in O(1)
  if (legalMoves.length === 0) {
    if (chess.inCheck()) {
      return chess.turn() === 'w'
        ? -CHECKMATE_SCORE - depth
        : CHECKMATE_SCORE + depth;
    }
    return STALEMATE_SCORE;
  }

  if (chess.isDraw()) {
    return STALEMATE_SCORE;
  }

  let bestScore: number;

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

      if (state.aborted) {
        break;
      }

      maxEval = Math.max(maxEval, evaluation);
      localAlpha = Math.max(localAlpha, evaluation);
      if (beta <= localAlpha) {
        break; // Beta cutoff
      }
    }
    bestScore = maxEval;
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

      if (state.aborted) {
        break;
      }

      minEval = Math.min(minEval, evaluation);
      localBeta = Math.min(localBeta, evaluation);
      if (localBeta <= alpha) {
        break; // Alpha cutoff
      }
    }
    bestScore = minEval;
  }

  // PERF: Store position evaluation in bounded Transposition Table
  if (state.tt && fenKey && state.tt.size < 100000) {
    let flag: 'exact' | 'lower' | 'upper' = 'exact';
    if (bestScore <= alpha) flag = 'upper';
    else if (bestScore >= beta) flag = 'lower';
    state.tt.set(fenKey, { depth, score: bestScore, flag });
  }

  return bestScore;
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
    const deadline =
      config.deadlineMs !== undefined
        ? config.deadlineMs
        : config.timeoutMs !== undefined
          ? startTime + config.timeoutMs
          : undefined;

    const chess = createSafeChess(fen);
    const state: SearchState = {
      nodesEvaluated: 0,
      tt: new Map<string, TranspositionEntry>(),
      deadline,
      maxNodes: config.maxNodes,
      aborted: false,
    };
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

      if (state.aborted && candidateMoves.length > 0) {
        break;
      }
    }

    const { selected, isBlunder } = chooseFinalMove(candidateMoves, config);

    const calculationDuration = performance.now() - startTime;

    return {
      move: selected.move,
      score: selected.score,
      depth: searchDepth,
      nodesEvaluated: state.nodesEvaluated,
      isBlunder,
      searchDurationMs: Math.round(calculationDuration),
    };
  }
}

/**
 * Singleton instance of MinimaxEngine for direct use.
 */
export const minimaxEngine = new MinimaxEngine();
