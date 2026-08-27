import type {
  Puzzle,
  PlayerMoveAction,
  PuzzleAnalysisResult,
  MaterialAdvantageSummary,
  PlayerMistakeRefutation,
  PuzzleStepExplanation,
  PuzzleTheme,
} from "./puzzle.js";
import type { PieceColor } from "./models.js";

/**
 * Pure engine interface for calculating material swings, detecting tactical motifs,
 * generating refutations on mistakes, and producing pedagogical explanations.
 * Adheres to Rule 2 (Pure Business Logic — zero I/O, zero framework).
 */
export interface PuzzleAnalysisEngineService {
  /**
   * Generates a complete pedagogical analysis of a puzzle from initial FEN to final solution ply.
   */
  analyzePuzzleSolution(puzzle: Puzzle): PuzzleAnalysisResult;

  /**
   * Evaluates the net material advantage gained between initial and final position.
   * Delta is calculated from the perspective of playerColor:
   * Delta = Material_final - Material_initial
   */
  calculateMaterialDelta(
    initialFen: string,
    finalFen: string,
    playerColor: PieceColor,
  ): MaterialAdvantageSummary;

  /**
   * Classifies the primary tactical motif executed in a move or sequence.
   */
  classifyTacticalMotif(
    fenBefore: string,
    moveUci: string,
    fenAfter: string,
  ): {
    readonly theme: PuzzleTheme;
    readonly confidence: number;
    readonly explanation: string;
  };

  /**
   * Generates a constructive refutation when a player attempts an incorrect move.
   * Evaluates opponent's punishing response in <15ms using local search.
   */
  generateMistakeRefutation(
    fen: string,
    playerMove: PlayerMoveAction,
    depth?: number,
  ): PlayerMistakeRefutation | null;

  /**
   * Synthesizes kid-friendly 1-2 sentence explanation of why a tactic worked.
   */
  generateKidExplanation(
    puzzle: Puzzle,
    analysis: PuzzleAnalysisResult,
  ): string;

  /**
   * Generates turn-by-turn explanations for every ply in the solution.
   */
  generateStepBreakdowns(
    puzzle: Puzzle,
  ): readonly PuzzleStepExplanation[];
}

export type {
  PlayerMoveAction,
  MoveValidationOutcome,
  PuzzleEngineService,
  RushTickResult,
  RushSolveResult,
  RushStrikeResult,
  PuzzleRushRules,
  ExtendedHintData,
  PuzzleAnalysisResult,
  MaterialAdvantageSummary,
  PlayerMistakeRefutation,
  PuzzleStepExplanation,
  PuzzleTheme,
} from "./puzzle.js";

