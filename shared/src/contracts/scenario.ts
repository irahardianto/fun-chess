import type { Square, PieceColor } from './models.js';

/**
 * High-level topic category for chess learning curriculum.
 * Expanded to include intermediate tactical motifs, checkmate pattern families,
 * endgame conversions, and classic opening traps.
 */
export type ScenarioCategory =
  | 'fundamentals'          // Piece movements, captures, board geometry
  | 'rules_and_basics'      // Alias for fundamentals / rules
  | 'special_moves'         // Castling, en passant, pawn promotion
  | 'tactical_patterns'     // Basic tactics: forks, pins, skewers, discovered attacks
  | 'intermediate_tactics'  // Advanced tactics: CCT, deflection, decoy, interference, clearance, Greek Gift, windmill, zwischenzug, desperado
  | 'checkmate_patterns'    // Basic checkmates: Scholar's Mate, Back-Rank, Fool's Mate
  | 'checkmate_families'    // Named checkmate patterns: Anastasia, Arabian, Hook, Vukovic, Boden, Balestra, Blackburne, Lolli, Damiano, Kill Box, Railroad, Blind Swine
  | 'endgame_basics'        // Basic endgames: King+Queen, King+Rook, pawn races
  | 'endgame_conversions'   // Lucena position, Philidor defense, Two Bishops mate
  | 'opening_traps';        // Famous traps: Legal's Trap, Fried Liver Attack, Noah's Ark

/**
 * Scenario difficulty calibrated for young learners (ages 7–15).
 */
export type ScenarioDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'master';

/**
 * Recommended target age cohort for pedagogical pacing and text tone.
 */
export type TargetAgeGroup = '5-8' | '7-10' | '11-15' | 'all';

/**
 * Performance star rating for completing a scenario attempt.
 * - 3 Stars: Solved cleanly with 0 hints used and 0 mistakes.
 * - 2 Stars: Solved using <= 1 hint or <= 1 retry.
 * - 1 Star:  Solved with multiple hints or retries (always awards at least 1 star for completion).
 */
export type StarRating = 1 | 2 | 3;

/**
 * Constrained move definition specifying acceptable source and target squares.
 */
export interface StepMoveConstraint {
  /** Source square required for the move (e.g. 'e2' or 'c7') */
  readonly from: Square;
  /** Destination square required for the move (e.g. 'e4' or 'c8') */
  readonly to: Square;
  /** Required promotion piece type if applicable */
  readonly promotion?: 'q' | 'r' | 'b' | 'n';
}

/**
 * Automated opponent response executed after player successfully finishes a step move.
 */
export interface StepOpponentResponse {
  /** Source square for the bot reply */
  readonly from: Square;
  /** Destination square for the bot reply */
  readonly to: Square;
  /** Required promotion piece if applicable */
  readonly promotion?: 'q' | 'r' | 'b' | 'n';
  /** Delay in milliseconds before executing the move (default: 500ms) */
  readonly delayMs?: number;
  /** Optional kid-friendly speech or reaction accompanying the move */
  readonly dialogue?: string;
}

/**
 * Individual interactive step within a multi-step chess tutorial or tactical puzzle.
 */
export interface TutorialStep {
  /** Unique step identifier within the scenario, e.g. "step-1" */
  readonly id: string;
  /** 1-based sequential step index */
  readonly stepNumber: number;
  /** Kid-friendly instructional prompt explaining the objective */
  readonly instruction: string;
  /** Optional secondary pedagogical tip explaining the "why" */
  readonly conceptExplanation?: string;
  /** Progressive hint message revealed when user taps the "Hint" button */
  readonly hint: string;
  /** Board FEN state loaded at the beginning of this step */
  readonly setupFen: string;
  /** Squares to highlight with soft ambient glow (e.g. target squares or friendly pieces) */
  readonly highlightSquares?: readonly Square[];
  /** Secondary squares to mark (e.g. enemy pieces under attack) */
  readonly threatSquares?: readonly Square[];
  /** Player side orientation for the board (default: 'w') */
  readonly playerColor?: PieceColor;
  /** Allowed valid player moves that advance this step. If empty, any legal move advances. */
  readonly allowedMoves?: readonly StepMoveConstraint[];
  /** Optional automatic bot counter-move triggered after player move */
  readonly opponentResponse?: StepOpponentResponse;
  /** Rewarding feedback message displayed immediately upon successful move */
  readonly explanationOnSuccess: string;
}

/**
 * Full tutorial scenario definition comprising multiple interactive steps.
 */
export interface ChessScenario {
  /** Unique kebab-case scenario ID, e.g. "knight-fork-royalty" */
  readonly id: string;
  /** Catchy, kid-friendly scenario title, e.g. "The Royal Knight Fork! ♞" */
  readonly title: string;
  /** Subtitle summarizing the lesson goal, e.g. "Attack the King and Queen at the same time!" */
  readonly subtitle: string;
  /** Topic category */
  readonly category: ScenarioCategory;
  /** Calibrated difficulty level */
  readonly difficulty: ScenarioDifficulty;
  /** Target learner age group */
  readonly targetAgeGroup: TargetAgeGroup;
  /** Vibrant emoji/icon representing the scenario */
  readonly icon: string;
  /** Full descriptive overview for card preview */
  readonly description: string;
  /** Estimated completion time in minutes */
  readonly estimatedMinutes: number;
  /** Ordered list of interactive tutorial steps */
  readonly steps: readonly TutorialStep[];
}

/**
 * Curriculum category section grouping related scenarios in the Academy view.
 */
export interface CurriculumSection {
  readonly id: ScenarioCategory;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly scenarios: readonly ChessScenario[];
}

/**
 * User progress record for an individual scenario stored locally.
 */
export interface ScenarioProgress {
  /** Scenario ID */
  readonly scenarioId: string;
  /** Highest star rating achieved (1, 2, or 3) */
  readonly starsEarned: StarRating;
  /** Number of times the scenario was attempted */
  readonly attemptsCount: number;
  /** Number of times hints were requested across attempts */
  readonly hintsUsedTotal: number;
  /** Timestamp in epoch ms when the scenario was first completed */
  readonly firstCompletedAt: number;
  /** Timestamp in epoch ms when the scenario was last completed */
  readonly lastCompletedAt: number;
}

/**
 * Key-value mapping of scenario ID to user progress record.
 */
export type ScenarioProgressMap = Record<string, ScenarioProgress>;

/**
 * Storage abstraction for persisting Scenario progress.
 * Adheres to I/O Isolation Rule (Rule 1).
 */
export interface ScenarioProgressStore {
  /** Retrieves all saved progress records */
  getProgressMap(): Promise<ScenarioProgressMap>;
  /** Retrieves progress for a specific scenario */
  getProgress(scenarioId: string): Promise<ScenarioProgress | null>;
  /** Saves or updates progress for a completed scenario */
  saveProgress(scenarioId: string, stars: StarRating, hintsUsed: number): Promise<ScenarioProgress>;
  /** Clears all progress records (reset progress) */
  resetAllProgress(): Promise<void>;
}

/**
 * Reactive state machine representation for active scenario playback.
 */
export interface ScenarioRunnerState {
  /** Currently active scenario */
  readonly scenario: ChessScenario | null;
  /** 0-based index of current active step */
  readonly currentStepIndex: number;
  /** Current active tutorial step */
  readonly currentStep: TutorialStep | null;
  /** Current board FEN string */
  readonly currentFen: string;
  /** Total steps in current scenario */
  readonly totalSteps: number;
  /** Whether the entire scenario is finished */
  readonly isCompleted: boolean;
  /** Number of hints requested during the current attempt */
  readonly hintsUsedCurrentAttempt: number;
  /** Mistakes made during the current attempt */
  readonly mistakesCurrentAttempt?: number;
  /** Active revealed hint message (null if not yet requested) */
  readonly activeHint: string | null;
  /** Highlight square suggested by active hint */
  readonly hintGlowSquare: Square | null;
  /** Target square suggested by active hint */
  readonly hintTargetSquare?: Square | null;
  /** Whether player is waiting for automated bot counter-move */
  readonly isWaitingForBotResponse: boolean;
  /** Error message if player played an incorrect move */
  readonly feedbackMessage: string | null;
  /** Whether current move attempt was correct */
  readonly isStepSuccess: boolean;
  /** Whether UI is currently triggering a soft shake animation */
  readonly isShaking?: boolean;
  /** Calculated star rating upon completion */
  readonly calculatedStars: StarRating;
}
