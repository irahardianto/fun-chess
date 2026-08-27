import type { Square, PieceColor, PieceType } from "./models.js";

/**
 * Calibrated AI difficulty levels mapped to distinct animal mascots.
 */
export type AiDifficultyLevel = "novice" | "beginner" | "intermediate" | "club";

/**
 * Mascot persona identifiers.
 */
export type MascotId = "peanut" | "sparky" | "fox" | "owl";

/**
 * Contextual triggers for dynamic mascot speech dialogue.
 */
export type MascotDialogueTrigger =
  | "game_start"
  | "player_move"
  | "ai_move"
  | "player_check"
  | "ai_check"
  | "player_blunder"
  | "ai_blunder"
  | "player_win"
  | "ai_win"
  | "draw"
  | "hint_requested"
  | "takeback_used";

/**
 * Mascot persona contract defining character traits, calibrated ELO, and kid-friendly dialogues.
 */
export interface MascotPersona {
  /** Identifier key */
  readonly id: MascotId;
  /** Display name, e.g. "Peanut the Pup" */
  readonly name: string;
  /** Character emoji avatar, e.g. "🐶" */
  readonly avatar: string;
  /** Persona title / subtitle, e.g. "Playful Pup" */
  readonly title: string;
  /** Calibrated approximate ELO score for UI display */
  readonly eloEstimate: number;
  /** Internal AI difficulty tier */
  readonly difficulty: AiDifficultyLevel;
  /** Kid-friendly character description */
  readonly description: string;
  /** Theme accent color (HSL token or hex) */
  readonly themeColor: string;
  /** Dialogue lines keyed by match trigger */
  readonly dialogues: Record<MascotDialogueTrigger, readonly string[]>;
}

/**
 * Centipawns numerical evaluation score (100 = 1 pawn advantage).
 * White advantage is positive, Black advantage is negative.
 */
export type EvaluationScore = number;

/**
 * 64-element numeric array representing positional value per square (index 0 = a8, index 63 = h1).
 */
export type PieceSquareTable = readonly number[];

/**
 * Complete set of Piece-Square Tables for all piece types.
 */
export interface PieceSquareTableSet {
  readonly pawns: PieceSquareTable;
  readonly knights: PieceSquareTable;
  readonly bishops: PieceSquareTable;
  readonly rooks: PieceSquareTable;
  readonly queens: PieceSquareTable;
  readonly kingMiddleGame: PieceSquareTable;
  readonly kingEndGame: PieceSquareTable;
}

/**
 * Configuration parameters for the Minimax / Alpha-Beta chess evaluator.
 */
export interface AiSearchConfig {
  /** Maximum ply depth to search in minimax tree (e.g. 1 to 5) */
  readonly depth: number;
  /** Probability (0.0 to 1.0) of selecting a random suboptimal move */
  readonly blunderChance: number;
  /** Maximum centipawn drop considered an acceptable mistake when blundering */
  readonly maxBlunderScoreDrop: number;
  /** Random noise added to positional score to prevent robotic repetitive play (in centipawns) */
  readonly evaluationNoise: number;
  /** Enable Piece-Square Tables positional evaluation */
  readonly usePst: boolean;
  /** Enable quiescence capture search at leaf nodes to avoid horizon effect */
  readonly useQuiescence: boolean;
  /** Artificial thinking delay range [minMs, maxMs] to emulate human thought */
  readonly simulatedThinkTimeMs: readonly [number, number];
}

/**
 * Evaluated chess move result returned by the AI engine.
 */
export interface AiMoveEvaluation {
  /** Best move found */
  readonly move: {
    readonly from: Square;
    readonly to: Square;
    readonly promotion?: "q" | "r" | "b" | "n";
  };
  /** Positional score in centipawns from AI's perspective */
  readonly score: EvaluationScore;
  /** Depth searched */
  readonly depth: number;
  /** Total positions (nodes) evaluated */
  readonly nodesEvaluated: number;
  /** Whether the chosen move was a simulated blunder */
  readonly isBlunder: boolean;
  /** Execution time in milliseconds */
  readonly searchDurationMs: number;
}

/**
 * Pure evaluation engine interface.
 * Implements Rule 2 (Pure Business Logic — no I/O, no UI bindings).
 */
export interface ChessAiEngine {
  /**
   * Evaluates the given position and selects a move based on difficulty profile.
   *
   * @param fen - Current board FEN position
   * @param config - Calibrated search parameters
   * @returns Evaluated move recommendation
   */
  findBestMove(fen: string, config: AiSearchConfig): Promise<AiMoveEvaluation>;

  /**
   * Evaluates static board position score in centipawns (positive for White, negative for Black).
   *
   * @param fen - Position FEN
   * @returns Static position score
   */
  evaluatePosition(fen: string): number;
}

/**
 * Tactical concept category identified by the hint engine.
 */
export type HintTheme =
  | "fork"
  | "pin"
  | "skewer"
  | "capture_free_piece"
  | "escape_attack"
  | "center_control"
  | "king_safety"
  | "checkmate_threat"
  | "pawn_promotion"
  | "general_development";

/**
 * Pedagogical hint returned to the learner when tapping "Ask for a Hint".
 */
export interface HintRecommendation {
  /** Recommended move */
  readonly move: {
    readonly from: Square;
    readonly to: Square;
    readonly promotion?: "q" | "r" | "b" | "n";
  };
  /** Square of the piece to move */
  readonly sourceSquare: Square;
  /** Destination square recommended */
  readonly targetSquare: Square;
  /** Kid-friendly clear explanation of why this move is recommended */
  readonly explanation: string;
  /** Identified tactical theme */
  readonly theme: HintTheme;
  /** Estimated score advantage from AI evaluation (in centipawns) */
  readonly scoreAdvantage: number;
}

/**
 * Interface for generating smart contextual hints.
 */
export interface HintCalculator {
  /**
   * Computes best move and kid-friendly explanation for active player.
   *
   * @param fen - Current FEN position
   * @param playerColor - Color of player requesting hint ('w' | 'b')
   * @returns Hint recommendation or null if no legal moves exist
   */
  calculateHint(
    fen: string,
    playerColor: PieceColor,
  ): Promise<HintRecommendation | null>;
}

/**
 * Historical snapshot preserved for instant takeback / undo.
 */
export interface TakebackSnapshot {
  /** Board FEN prior to player's last move */
  readonly fen: string;
  /** Turn indicator prior to player's last move */
  readonly turn: PieceColor;
  /** Move history snapshot */
  readonly moveCount: number;
  /** Captured pieces state */
  readonly capturedWhite: readonly PieceType[];
  readonly capturedBlack: readonly PieceType[];
}

/**
 * Solo AI Match Session state.
 */
export interface SoloAiGameState {
  /** Selected opponent mascot persona */
  readonly mascot: MascotPersona;
  /** Human player assigned color ('w' or 'b') */
  readonly playerColor: PieceColor;
  /** Whether the AI is currently calculating a move */
  readonly isAiThinking: boolean;
  /** Active mascot speech bubble dialogue text */
  readonly activeMascotDialogue: string | null;
  /** Number of takebacks used in the current match */
  readonly takebackCount: number;
  /** Number of hints requested in the current match */
  readonly hintsCount: number;
  /** Active hint recommendation */
  readonly activeHint: HintRecommendation | null;
}
