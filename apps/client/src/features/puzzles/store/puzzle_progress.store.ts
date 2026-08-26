import type {
  PuzzleProgress,
  PuzzleProgressStore,
  AdaptiveRatingState,
  PuzzleTheme,
  PuzzleAttemptResult,
  StarRating,
  ThemeMasteryProgress,
  PuzzleArcadeStats,
  SolvedPuzzleRecord,
} from '@fun-chess/shared';

export const PUZZLE_PROGRESS_STORAGE_KEY = 'fun_chess_puzzle_progress_v2';

export const DEFAULT_ADAPTIVE_RATING: AdaptiveRatingState = {
  rating: 800,
  ratingDeviation: 350,
  peakRating: 800,
  totalAttempted: 0,
  totalSolved: 0,
  bestStreak: 0,
  ratingHistory: [],
};

export const DEFAULT_PUZZLE_PROGRESS: PuzzleProgress = {
  ratingProfile: DEFAULT_ADAPTIVE_RATING,
  themeMastery: {},
  arcadeStats: {
    puzzleRushHighScore: 0,
    puzzleRushBestStreak: 0,
    streakSurvivorHighScore: 0,
    totalRushRuns: 0,
  },
  solvedPuzzles: {},
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
};

export type {
  PuzzleProgress,
  PuzzleProgressStore,
  AdaptiveRatingState,
  PuzzleTheme,
  PuzzleAttemptResult,
  StarRating,
  ThemeMasteryProgress,
  PuzzleArcadeStats,
  SolvedPuzzleRecord,
};
