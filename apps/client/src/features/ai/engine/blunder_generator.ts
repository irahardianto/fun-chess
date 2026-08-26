import type { Square, AiSearchConfig } from '@fun-chess/shared';

/**
 * Candidate move evaluated by the search engine at the root position.
 */
export interface EvaluatedCandidateMove {
  /** The chess move */
  readonly move: {
    readonly from: Square;
    readonly to: Square;
    readonly promotion?: 'q' | 'r' | 'b' | 'n';
  };
  /** Centipawns score from standard perspective (positive White, negative Black) */
  readonly score: number;
  /** Score from AI's perspective (higher is always better for the AI) */
  readonly aiScore: number;
}

/**
 * Determines whether a blunder should be injected based on blunder probability.
 *
 * @param blunderChance - Probability between 0.0 and 1.0
 * @param randomFn - Random number generator (defaults to Math.random)
 */
export function shouldTriggerBlunder(
  blunderChance: number,
  randomFn: () => number = Math.random,
): boolean {
  if (blunderChance <= 0) return false;
  if (blunderChance >= 1) return true;
  return randomFn() < blunderChance;
}

/**
 * Adds calibrated evaluation noise to prevent robotic deterministic moves.
 *
 * @param score - Raw score
 * @param noiseMax - Maximum noise in centipawns
 * @param randomFn - Random number generator
 */
export function applyEvaluationNoise(
  score: number,
  noiseMax: number,
  randomFn: () => number = Math.random,
): number {
  if (noiseMax <= 0) return score;
  const noise = (randomFn() * 2 - 1) * noiseMax;
  return score + noise;
}

/**
 * Selects a suboptimal blunder move whose score drop is within the allowed threshold.
 *
 * @param candidates - Sorted candidate moves (best AI score first)
 * @param maxScoreDrop - Maximum allowed score drop in centipawns
 * @param randomFn - Random number generator
 */
export function selectBlunderMove(
  candidates: readonly EvaluatedCandidateMove[],
  maxScoreDrop: number,
  randomFn: () => number = Math.random,
): EvaluatedCandidateMove | null {
  if (candidates.length <= 1) return null;

  const bestCandidate = candidates[0];
  if (!bestCandidate) return null;

  const bestAiScore = bestCandidate.aiScore;

  // Filter candidates that are suboptimal, with score drop <= maxScoreDrop
  const eligibleBlunders = candidates.filter((c, idx) => {
    if (idx === 0) return false;
    const scoreDrop = bestAiScore - c.aiScore;
    return scoreDrop > 0 && scoreDrop <= maxScoreDrop;
  });

  if (eligibleBlunders.length > 0) {
    const selectedIndex = Math.floor(randomFn() * eligibleBlunders.length);
    return eligibleBlunders[selectedIndex] ?? eligibleBlunders[0] ?? null;
  }

  // Fallback: if no candidates in exact drop window, return 2nd best move if available
  return candidates[1] ?? null;
}

/**
 * Selects the final move from evaluated candidates, applying blunder chance and evaluation noise.
 *
 * @param candidates - Evaluated candidate moves from search (must not be empty)
 * @param config - Calibrated AI search configuration
 * @param randomFn - Random number generator
 */
export function chooseFinalMove(
  candidates: readonly EvaluatedCandidateMove[],
  config: AiSearchConfig,
  randomFn: () => number = Math.random,
): { selected: EvaluatedCandidateMove; isBlunder: boolean } {
  if (candidates.length === 0) {
    throw new Error('Cannot choose final move from empty candidate list');
  }

  if (candidates.length === 1) {
    const onlyMove = candidates[0]!;
    return { selected: onlyMove, isBlunder: false };
  }

  // Sort descending by AI score
  const sorted = [...candidates].sort((a, b) => b.aiScore - a.aiScore);
  const bestMove = sorted[0]!;

  const triggerBlunder = shouldTriggerBlunder(config.blunderChance, randomFn);

  if (triggerBlunder) {
    const blunder = selectBlunderMove(sorted, config.maxBlunderScoreDrop, randomFn);
    if (blunder) {
      return { selected: blunder, isBlunder: true };
    }
  }

  // If noise is enabled and not blundering, choose among moves that are within noise range of best move
  if (config.evaluationNoise > 0) {
    const topMoves = sorted.filter(
      (c) => bestMove.aiScore - c.aiScore <= config.evaluationNoise,
    );
    if (topMoves.length > 1) {
      const chosen = topMoves[Math.floor(randomFn() * topMoves.length)]!;
      return { selected: chosen, isBlunder: false };
    }
  }

  return { selected: bestMove, isBlunder: false };
}
