import { Chess } from 'chess.js';
import type {
  PieceColor,
  Puzzle,
  PuzzleTheme,
  PlayerMoveAction,
  MaterialAdvantageSummary,
  PuzzleAnalysisResult,
  PlayerMistakeRefutation,
  PuzzleStepExplanation,
  PuzzleAnalysisEngineService,
} from '@fun-chess/shared';
import {
  parseUciMove,
  createSafeChess,
  isValidFen,
} from '@fun-chess/shared';

// Modular sub-module exports (MAJ-007)
export * from './geometry/attack_rays';
export * from './eval/material_delta';
export * from './pedagogy/rules_of_thumb';
export * from './tactics/theme_detector';

import { logger } from '@/platform/telemetry';

import {
  getMaterialCount,
  calculateMaterialDelta,
} from './eval/material_delta';
import {
  THEME_RULES_OF_THUMB,
  generateStepBreakdowns,
  generateKidExplanation,
  generateMistakeRefutation,
} from './pedagogy/rules_of_thumb';
import {
  classifyTacticalMotif,
} from './tactics/theme_detector';

/**
 * Creates fallback analysis result for missing or corrupted puzzle data.
 */
function createFallbackAnalysisResult(puzzle?: Puzzle): PuzzleAnalysisResult {
  const fallbackMat = { white: 0, black: 0, net: 0 };
  const detectedTheme = puzzle?.primaryTheme || 'fork';
  return {
    initialMaterial: fallbackMat,
    finalMaterial: fallbackMat,
    materialDeltaCentipawns: 0,
    netPointsDelta: 0,
    advantageSummary: {
      netCentipawns: 0,
      netPoints: 0,
      formattedAdvantage: 'Positional Advantage ⚡',
      isDecisive: false,
    },
    detectedTheme,
    isCheckmate: false,
    isPawnPromotion: false,
    tacticalHeadline: puzzle?.title || 'Tactical Solution',
    kidFriendlyExplanation: puzzle?.learningSummary || 'Great tactical vision!',
    ruleOfThumb: puzzle?.keyTakeaway || THEME_RULES_OF_THUMB[detectedTheme] || 'Always look for forcing moves!',
    stepNarratives: [],
  };
}

/**
 * Simulates puzzle solution moves on a chess instance.
 */
function simulateSolutionMoves(
  chessSim: Chess,
  moves: readonly string[],
): { isPawnPromo: boolean } {
  let isPawnPromo = false;
  for (const moveUci of moves) {
    if (moveUci.length > 4) isPawnPromo = true;
    const { from, to, promotion } = parseUciMove(moveUci);
    try {
      chessSim.move({
        from: from as unknown as import('chess.js').Square,
        to: to as unknown as import('chess.js').Square,
        promotion,
      });
    } catch (err: unknown) {
      logger.debug('Illegal move during solution simulation', {
        operation: 'simulate_solution_moves',
        moveUci,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }
  return { isPawnPromo };
}

/**
 * Generates a complete pedagogical analysis of a puzzle from initial FEN to final solution ply.
 */
export function analyzePuzzleSolution(puzzle: Puzzle): PuzzleAnalysisResult {
  if (!puzzle || !puzzle.fen || !isValidFen(puzzle.fen)) {
    return createFallbackAnalysisResult(puzzle);
  }

  let chessInit: Chess;
  let chessSim: Chess;
  try {
    chessInit = createSafeChess(puzzle.fen);
    chessSim = createSafeChess(puzzle.fen);
  } catch (err: unknown) {
    logger.debug('Invalid FEN in analyzePuzzleSolution', {
      operation: 'analyze_puzzle_solution_fen_parse',
      fen: puzzle.fen,
      error: err instanceof Error ? err.message : String(err),
    });
    return createFallbackAnalysisResult(puzzle);
  }

  const initialMaterial = getMaterialCount(chessInit);
  const stepNarratives = generateStepBreakdowns(puzzle);
  const { isPawnPromo } = simulateSolutionMoves(chessSim, puzzle.moves ?? []);

  const finalMaterial = getMaterialCount(chessSim);
  const isCheckmate = chessSim.isCheckmate();
  const advantageSummary = calculateMaterialDelta(puzzle.fen, chessSim.fen(), puzzle.playerColor, isCheckmate);

  const initBal = puzzle.playerColor === 'w' ? initialMaterial.white - initialMaterial.black : initialMaterial.black - initialMaterial.white;
  const finalBal = puzzle.playerColor === 'w' ? finalMaterial.white - finalMaterial.black : finalMaterial.black - finalMaterial.white;
  const materialDeltaCentipawns = advantageSummary.netCentipawns === 10000 ? 10000 : finalBal - initBal;

  let detectedTheme = puzzle.primaryTheme;
  if (!detectedTheme && puzzle.moves?.[0]) {
    const classified = classifyTacticalMotif(puzzle.fen, puzzle.moves[0], chessSim.fen());
    detectedTheme = classified.theme;
  }

  const headline = puzzle.title || `${advantageSummary.formattedAdvantage} Tactical Win!`;
  const ruleOfThumb = puzzle.keyTakeaway || THEME_RULES_OF_THUMB[detectedTheme] || 'Look for checks, captures, and threats on every move!';

  const partialResult: PuzzleAnalysisResult = {
    initialMaterial,
    finalMaterial,
    materialDeltaCentipawns,
    netPointsDelta: advantageSummary.netPoints,
    advantageSummary,
    detectedTheme,
    isCheckmate,
    isPawnPromotion: isPawnPromo,
    tacticalHeadline: headline,
    kidFriendlyExplanation: '',
    ruleOfThumb,
    stepNarratives,
  };

  const kidExplanation = generateKidExplanation(puzzle, partialResult);

  return {
    ...partialResult,
    kidFriendlyExplanation: kidExplanation,
  };
}

/**
 * Concrete implementation of PuzzleAnalysisEngineService.
 */
export class PuzzleAnalysisEngine implements PuzzleAnalysisEngineService {
  analyzePuzzleSolution(puzzle: Puzzle): PuzzleAnalysisResult {
    return analyzePuzzleSolution(puzzle);
  }

  calculateMaterialDelta(
    initialFen: string,
    finalFen: string,
    playerColor: PieceColor,
  ): MaterialAdvantageSummary {
    return calculateMaterialDelta(initialFen, finalFen, playerColor);
  }

  classifyTacticalMotif(
    fenBefore: string,
    moveUci: string,
    fenAfter: string,
  ): {
    readonly theme: PuzzleTheme;
    readonly confidence: number;
    readonly explanation: string;
  } {
    return classifyTacticalMotif(fenBefore, moveUci, fenAfter);
  }

  generateMistakeRefutation(
    fen: string,
    playerMove: PlayerMoveAction,
    depth?: number,
  ): PlayerMistakeRefutation | null {
    return generateMistakeRefutation(fen, playerMove, depth);
  }

  generateKidExplanation(puzzle: Puzzle, analysis: PuzzleAnalysisResult): string {
    return generateKidExplanation(puzzle, analysis);
  }

  generateStepBreakdowns(puzzle: Puzzle): readonly PuzzleStepExplanation[] {
    return generateStepBreakdowns(puzzle);
  }
}

export const puzzleAnalysisEngine = new PuzzleAnalysisEngine();
