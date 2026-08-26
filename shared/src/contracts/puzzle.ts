import type { Square, PieceColor } from './models.js';
import type { StarRating } from './scenario.js';
import type { PuzzleErrorCode, PuzzleErrorPayload } from './errors.js';

/**
 * Comprehensive tactical and positional motif themes for curated puzzles.
 * Grouped into 5 pedagogical domains for structured chess learning.
 */
export type PuzzleTheme =
  // --- Domain 1: Fundamental Tactics ---
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered_attack'
  | 'discovered_check'
  | 'double_check'
  | 'hanging_piece'
  | 'trapped_piece'
  // --- Domain 2: Intermediate Tactical Motifs ---
  | 'captures_checks_threats' // CCT calculation discipline
  | 'knight_outpost'
  | 'cross_pin'
  | 'battery'
  | 'deflection'
  | 'decoy'
  | 'interference'
  | 'clearance'
  | 'greek_gift'
  | 'windmill'
  | 'zwischenzug'             // In-between move
  | 'desperado'
  | 'overloaded_piece'
  | 'x_ray_attack'
  // --- Domain 3: Checkmate Pattern Families ---
  | 'mate_in_1'
  | 'mate_in_2'
  | 'mate_in_3'
  | 'back_rank_mate'
  | 'scholars_mate'
  | 'smothered_mate'
  | 'anastasia_mate'
  | 'arabian_mate'
  | 'hook_mate'
  | 'vukovic_mate'
  | 'boden_mate'
  | 'balestra_mate'
  | 'blackburne_mate'
  | 'lolli_mate'
  | 'damiano_mate'
  | 'kill_box_mate'
  | 'railroad_mate'
  | 'blind_swine_mate'
  | 'dovetail_mate'
  // --- Domain 4: Endgame Conversions ---
  | 'pawn_endgame'
  | 'rook_endgame'
  | 'queen_endgame'
  | 'minor_piece_endgame'
  | 'lucena_position'
  | 'philidor_defense'
  | 'two_bishops_mate'
  // --- Domain 5: Opening Traps & Defenses ---
  | 'legals_trap'
  | 'fried_liver'
  | 'noahs_ark_trap'
  | 'fools_mate';

/**
 * High-level theme category for drill filtering.
 */
export type PuzzleThemeCategory =
  | 'basic_tactics'
  | 'advanced_tactics'
  | 'checkmate_patterns'
  | 'endgame_technique'
  | 'opening_traps';

/**
 * Metadata descriptor for rendering theme cards in Themed Drills.
 */
export interface PuzzleThemeDescriptor {
  readonly id: PuzzleTheme;
  readonly category: PuzzleThemeCategory;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly kidFriendlyTip: string;
  readonly estimatedRatingRange: readonly [number, number];
}

/**
 * Calibrated puzzle difficulty tier based on target ELO.
 */
export type PuzzleDifficultyTier =
  | 'novice'       // 600 - 900  (1-move captures / simple mate in 1)
  | 'easy'         // 900 - 1200 (2-ply forks, pins, simple mates)
  | 'medium'       // 1200 - 1500 (3-4 ply intermediate tactics)
  | 'hard'         // 1500 - 1800 (Complex multi-ply combinations)
  | 'expert';      // 1800+       (Subtle sacrifices & endgame accuracy)

/**
 * Core immutable puzzle representation derived from curated offline CC0 positions.
 */
export interface Puzzle {
  /** Unique puzzle identifier, e.g. "puz_fork_001" */
  readonly id: string;
  /** Initial board FEN position before the setup move or player move */
  readonly fen: string;
  /**
   * Solution line represented as standard UCI move strings (e.g. ["e2e4", "e7e5", "g1f3"]).
   * If initialPly is odd, moves[0] is the opponent's setup move to trigger the puzzle position.
   */
  readonly moves: readonly string[];
  /** Calibrated difficulty rating (Elo / Glicko) */
  readonly rating: number;
  /** Rating deviation / confidence (Glicko RD) */
  readonly ratingDeviation: number;
  /** Identified tactical themes and motifs */
  readonly themes: readonly PuzzleTheme[];
  /** Primary theme of the puzzle for categorized drills */
  readonly primaryTheme: PuzzleTheme;
  /** Difficulty tier classification */
  readonly difficulty: PuzzleDifficultyTier;
  /** Kid-friendly puzzle title, e.g. "The Royal Knight Leap! ♞" */
  readonly title: string;
  /** Catchy subtitle or hint clue */
  readonly subtitle?: string;
  /** Side to move for the player ('w' | 'b') */
  readonly playerColor: PieceColor;
  /** Number of half-moves in the complete solution */
  readonly solutionPlies: number;
}

/**
 * Offline puzzle pack metadata header.
 */
export interface PuzzlePackMetadata {
  readonly version: string;
  readonly generatedAt: string;
  readonly totalPuzzles: number;
  readonly themeDistribution: Record<string, number>;
  readonly ratingDistribution: {
    readonly novice: number;
    readonly easy: number;
    readonly medium: number;
    readonly hard: number;
    readonly expert: number;
  };
}

/**
 * Complete offline bundle format loaded client-side.
 */
export interface PuzzleBundle {
  readonly metadata: PuzzlePackMetadata;
  readonly puzzles: readonly Puzzle[];
}

/**
 * Three progressive tiers of assistance designed for zero-frustration learning.
 * - Tier 1 (Nudge): Highlights the source square of the piece that needs to move.
 * - Tier 2 (Target): Highlights the destination target square / zone with tactical rationale.
 * - Tier 3 (Solution): Displays the complete solution move arrow and exact UCI move.
 */
export type HintLevel = 0 | 1 | 2 | 3;

export type HintTierName = 'none' | 'piece_nudge' | 'target_glow' | 'full_solution';

/**
 * Structured hint payload returned to the UI when a hint is requested.
 */
export interface HintData {
  /** Current active hint level (1, 2, or 3) */
  readonly level: HintLevel;
  /** Friendly tier name */
  readonly tier: HintTierName;
  /** Source square of the piece that should move (revealed in Tier 1+) */
  readonly sourceSquare?: Square;
  /** Destination target square (revealed in Tier 2+) */
  readonly targetSquare?: Square;
  /** Kid-friendly hint message explaining the concept */
  readonly message: string;
  /** Full algebraic move string (e.g. "Nf7#", revealed in Tier 3) */
  readonly solutionSan?: string;
  /** UCI move format (e.g. "d5f7", revealed in Tier 3) */
  readonly solutionUci?: string;
  /** Mascot dialogue accompanying the hint */
  readonly mascotDialogue?: string;
}

/**
 * Game modes available within the Puzzle Hub.
 */
export type PuzzleMode =
  | 'themed_drills'     // Untimed targeted practice by motif/theme
  | 'adaptive_ladder'   // Adaptive Elo rating climb with dynamic difficulty
  | 'puzzle_rush'       // 3-minute timed rapid-fire challenge
  | 'streak_survivor';  // 3-strike survival mode (how far can you go?)

/**
 * Result state for a single puzzle attempt within a session.
 */
export type PuzzleAttemptResult =
  | 'unsolved'
  | 'solved_first_try'
  | 'solved_with_hints'
  | 'solved_with_retries'
  | 'failed';

/**
 * Base state for any active puzzle session.
 */
export interface BasePuzzleSessionState {
  readonly mode: PuzzleMode;
  readonly currentPuzzle: Puzzle | null;
  readonly currentFen: string;
  readonly currentMoveIndex: number;      // Current ply index in puzzle.moves
  readonly isPlayerTurn: boolean;
  readonly isCompleted: boolean;
  readonly isSolvedSuccessfully: boolean;
  readonly attemptResult: PuzzleAttemptResult;
  readonly currentHintLevel: HintLevel;
  readonly activeHint: HintData | null;
  readonly mistakesCount: number;
  readonly selectedSquare: Square | null;
  readonly legalMoves: readonly Square[];
  readonly lastMove: { readonly from: Square; readonly to: Square } | null;
  readonly isShaking: boolean;
  readonly feedbackMessage: string | null;
}

/**
 * Themed Drills Session State (Untimed practice).
 */
export interface ThemedDrillsSessionState extends BasePuzzleSessionState {
  readonly mode: 'themed_drills';
  readonly activeTheme: PuzzleTheme;
  readonly puzzlesSolvedInSession: number;
  readonly totalPuzzlesInTheme: number;
  readonly sessionAccuracyPercent: number;
}

/**
 * Adaptive Ladder Session State.
 */
export interface AdaptiveLadderSessionState extends BasePuzzleSessionState {
  readonly mode: 'adaptive_ladder';
  readonly currentRating: number;
  readonly initialSessionRating: number;
  readonly ratingDelta: number;
  readonly ratingConfidence: number;      // RD
  readonly streakCount: number;
  readonly bestStreakSession: number;
  readonly targetPuzzleRating: number;
}

/**
 * Puzzle Rush Session State (3-minute blitz sprint).
 */
export interface PuzzleRushSessionState extends BasePuzzleSessionState {
  readonly mode: 'puzzle_rush';
  readonly timeRemainingSeconds: number;
  readonly initialTimeSeconds: number;    // default: 180s (3 min)
  readonly score: number;                 // Total puzzles solved correctly
  readonly strikes: number;               // Strikes accumulated (max: 3)
  readonly maxStrikes: number;            // default: 3
  readonly comboMultiplier: number;       // 1x, 2x, 3x on consecutive correct solves
  readonly currentStreak: number;
  readonly isTimerRunning: boolean;
  readonly isGameOver: boolean;
  readonly timeBonusEarnedSeconds: number;// +5s bonus on fast streak solves
}

/**
 * Streak Survivor Session State (Untimed 3-strike survival).
 */
export interface StreakSurvivorSessionState extends BasePuzzleSessionState {
  readonly mode: 'streak_survivor';
  readonly livesRemaining: number;        // default: 3
  readonly maxLives: number;
  readonly currentStreak: number;
  readonly bestStreakAllTime: number;
  readonly score: number;
  readonly isGameOver: boolean;
}

/**
 * Union type for all active session states.
 */
export type PuzzleSessionState =
  | ThemedDrillsSessionState
  | AdaptiveLadderSessionState
  | PuzzleRushSessionState
  | StreakSurvivorSessionState;

/**
 * Historical rating adjustment point for charting.
 */
export interface RatingHistoryPoint {
  readonly timestamp: number;
  readonly rating: number;
  readonly puzzleId: string;
  readonly delta: number;
}

/**
 * Adaptive Elo Rating State for a young learner.
 * Uses child-friendly floor protections (rating cannot drop below 500)
 * and generous bonus scaling on clean streaks.
 */
export interface AdaptiveRatingState {
  /** Current calibrated puzzle Elo (default: 800 for beginners) */
  readonly rating: number;
  /** Rating deviation / volatility (default: 350) */
  readonly ratingDeviation: number;
  /** Peak Elo achieved all-time */
  readonly peakRating: number;
  /** Total puzzles attempted across all modes */
  readonly totalAttempted: number;
  /** Total puzzles solved cleanly */
  readonly totalSolved: number;
  /** All-time longest solve streak without mistakes */
  readonly bestStreak: number;
  /** History of rating adjustments for chart rendering (last 50 data points) */
  readonly ratingHistory: readonly RatingHistoryPoint[];
}

/**
 * Performance summary for a single puzzle theme.
 */
export interface ThemeMasteryProgress {
  readonly theme: PuzzleTheme;
  readonly attempted: number;
  readonly solved: number;
  readonly starsEarned: number;
  readonly masteryLevel: 'novice' | 'apprentice' | 'master';
  readonly lastPracticedAt: number;
}

/**
 * High scores record for arcade modes.
 */
export interface PuzzleArcadeStats {
  readonly puzzleRushHighScore: number;
  readonly puzzleRushBestStreak: number;
  readonly streakSurvivorHighScore: number;
  readonly totalRushRuns: number;
}

/**
 * Record of solved puzzle completion.
 */
export interface SolvedPuzzleRecord {
  readonly stars: StarRating;
  readonly solvedAt: number;
}

/**
 * Overall persistent user progress across the entire Puzzle Hub.
 */
export interface PuzzleProgress {
  /** Player's adaptive Elo rating profile */
  readonly ratingProfile: AdaptiveRatingState;
  /** Theme-by-theme mastery stats */
  readonly themeMastery: Record<string, ThemeMasteryProgress>;
  /** Arcade high scores */
  readonly arcadeStats: PuzzleArcadeStats;
  /** Map of solved puzzle IDs with best star rating (1-3) */
  readonly solvedPuzzles: Record<string, SolvedPuzzleRecord>;
  /** Epoch ms timestamp when profile was created */
  readonly createdAt: number;
  /** Epoch ms timestamp when profile was last updated */
  readonly lastActiveAt: number;
}

/**
 * Storage abstraction for persisting Puzzle Hub progress.
 * Adheres to Rule 1 (I/O Isolation).
 */
export interface PuzzleProgressStore {
  /** Retrieves full player puzzle progress record */
  getProgress(): Promise<PuzzleProgress>;
  /** Updates adaptive rating profile after a ladder match */
  updateRating(newRatingState: AdaptiveRatingState): Promise<void>;
  /** Records a solved or attempted puzzle result */
  recordPuzzleAttempt(
    puzzleId: string,
    theme: PuzzleTheme,
    result: PuzzleAttemptResult,
    stars: StarRating
  ): Promise<PuzzleProgress>;
  /** Updates Puzzle Rush or Streak Survivor high scores */
  saveArcadeResult(mode: 'puzzle_rush' | 'streak_survivor', score: number, streak: number): Promise<PuzzleProgress>;
  /** Resets all puzzle progress (user data reset) */
  resetAll(): Promise<void>;
}

/**
 * Player move input action in puzzle engine.
 */
export interface PlayerMoveAction {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: 'q' | 'r' | 'b' | 'n';
}

/**
 * Result of validating a player's move against expected solution.
 */
export interface MoveValidationOutcome {
  /** Whether the move matches the puzzle's expected solution ply */
  readonly isCorrect: boolean;
  /** Whether the complete puzzle solution is now finished */
  readonly isPuzzleComplete: boolean;
  /** Next FEN string after applying player move and optional bot response */
  readonly nextFen: string;
  /** Automated bot counter-move if puzzle continues */
  readonly botReplyMove?: {
    readonly from: Square;
    readonly to: Square;
    readonly promotion?: 'q' | 'r' | 'b' | 'n';
    readonly san: string;
    readonly uci: string;
  };
  /** Next ply index in solution */
  readonly nextMoveIndex: number;
  /** Encouraging feedback message */
  readonly feedback: string;
}

/**
 * Validates a player move against the current solution ply of a puzzle.
 * Pure function adhering to Rule 2.
 */
export interface PuzzleEngineService {
  validateMove(
    puzzle: Puzzle,
    currentMoveIndex: number,
    currentFen: string,
    playerMove: PlayerMoveAction
  ): MoveValidationOutcome;

  generateHint(
    puzzle: Puzzle,
    currentMoveIndex: number,
    currentFen: string,
    requestedLevel: HintLevel
  ): HintData;

  calculatePuzzleStars(hintsUsed: number, mistakesCount: number): StarRating;
}

/**
 * Parameters passed to the adaptive rating calculator.
 */
export interface RatingAdjustmentParams {
  readonly playerRating: number;
  readonly playerRd: number;
  readonly puzzleRating: number;
  readonly isSuccess: boolean;
  readonly hintsUsed: number;
  readonly currentStreak: number;
}

/**
 * Output of adaptive rating adjustment calculation.
 */
export interface RatingAdjustmentResult {
  readonly newRating: number;
  readonly newRd: number;
  readonly delta: number;
  readonly streakBonus: number;
  readonly isProtectedByFloor: boolean;
}

/**
 * Pure calculation functions for dynamic Elo progression tailored for kids.
 */
export interface AdaptiveRatingCalculator {
  calculateAdjustment(params: RatingAdjustmentParams): RatingAdjustmentResult;
  selectTargetPuzzleRating(currentRating: number, streak: number): number;
}

/**
 * Tick output for Puzzle Rush arcade countdown timer.
 */
export interface RushTickResult {
  readonly timeRemainingSeconds: number;
  readonly isExpired: boolean;
}

/**
 * Solve event output for Puzzle Rush streak and scoring.
 */
export interface RushSolveResult {
  readonly newScore: number;
  readonly newStreak: number;
  readonly comboMultiplier: number;
  readonly timeBonusSeconds: number;
  readonly isNewHighScore: boolean;
}

/**
 * Strike event output for Puzzle Rush / Survivor life tracking.
 */
export interface RushStrikeResult {
  readonly newStrikes: number;
  readonly isGameOver: boolean;
  readonly comboReset: boolean;
}

/**
 * Pure logic interface for managing Puzzle Rush arcade rules.
 */
export interface PuzzleRushRules {
  applySolve(currentScore: number, currentStreak: number, highScore: number, solveTimeMs: number): RushSolveResult;
  applyStrike(currentStrikes: number, maxStrikes?: number): RushStrikeResult;
  calculateTimeTick(currentSeconds: number, deltaSeconds: number): RushTickResult;
}

// Re-export error contracts for convenience
export type { PuzzleErrorCode, PuzzleErrorPayload };
