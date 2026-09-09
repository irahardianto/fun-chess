import type { PieceColor } from "./models.js";
import type { MascotId } from "./ai.js";
import type { PuzzleMode, PuzzleTheme } from "./puzzle.js";

/**
 * Primary game modes available within Fun Chess.
 */
export type AppGameMode =
  | "lobby" // Main menu mode selector
  | "multiplayer_lan" // Play with Friends (Online or Wi-Fi Multiplayer)
  | "solo_ai" // Single-player match against Mascot AI
  | "academy" // Interactive Chess Academy & Guided Lessons
  | "puzzle_hub"; // Gamified Tactical Puzzle Hub (Drills, Ladder, Rush)

/**
 * Card descriptor for rendering mode choices in the Lobby.
 */
export interface LobbyModeOption {
  readonly id: AppGameMode;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly badge?: string;
  readonly colorTheme: "primary" | "accent" | "success" | "warning";
}

/**
 * Configuration payload for launching a Solo AI match.
 */
export interface SoloAiLaunchConfig {
  readonly mascotId: MascotId;
  readonly playerColor: PieceColor | "random";
  readonly playerName: string;
  readonly playerAvatar: string;
}

/**
 * Configuration payload for launching a specific Academy Scenario.
 */
export interface AcademyLaunchConfig {
  readonly scenarioId: string;
  readonly autoStartStep?: number;
}

/**
 * Launch configuration for the Puzzle Hub.
 */
export interface PuzzleHubLaunchConfig {
  readonly mode: PuzzleMode;
  readonly theme?: PuzzleTheme;
  readonly targetRating?: number;
}

/**
 * Unified application state governing view routing and active modes.
 */
export interface AppShellState {
  /** Active high-level screen */
  readonly currentMode: AppGameMode;
  /** Solo AI configuration when mode === 'solo_ai' */
  readonly soloAiConfig: SoloAiLaunchConfig | null;
  /** Academy scenario configuration when mode === 'academy' */
  readonly academyConfig: AcademyLaunchConfig | null;
  /** Puzzle Hub configuration when mode === 'puzzle_hub' */
  readonly puzzleHubConfig?: PuzzleHubLaunchConfig | null;
  /** Global audio mute toggle */
  readonly isMuted: boolean;
  /** Dark mode toggle */
  readonly isDarkMode: boolean;
}
