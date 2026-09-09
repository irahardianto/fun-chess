export * from './composables';
export * from './data';
export * from './engine';
export * from './store';
export * from './components';
export { default as PuzzleArena } from './PuzzleArena.vue';
export { default as PuzzleHubView } from './PuzzleHubView.vue';

// Explicit re-exports of public stores and essential interfaces (MAJ-007)
export {
  LocalStoragePuzzleProgressStore,
  InMemoryPuzzleProgressStore,
  createPuzzleProgressStore,
  defaultLocalStoragePuzzleProgressStore,
  PUZZLE_PROGRESS_STORAGE_KEY,
  DEFAULT_ADAPTIVE_RATING,
  DEFAULT_PUZZLE_PROGRESS,
} from './store';

export type {
  PuzzleProgress,
  PuzzleProgressStore,
  AdaptiveRatingState,
  PuzzleTheme,
  PuzzleAttemptResult,
  ThemeMasteryProgress,
  PuzzleArcadeStats,
  SolvedPuzzleRecord,
} from './store';
