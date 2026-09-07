import type {
  PuzzleProgress,
  PuzzleProgressStore,
  AdaptiveRatingState,
  PuzzleTheme,
  PuzzleAttemptResult,
  StarRating,
} from '@fun-chess/shared';
import {
  DEFAULT_PUZZLE_PROGRESS,
  DEFAULT_ADAPTIVE_RATING,
} from './puzzle_progress.store';

export class InMemoryPuzzleProgressStore implements PuzzleProgressStore {
  private progress: PuzzleProgress;

  constructor(initialProgress?: Partial<PuzzleProgress>) {
    this.progress = {
      ...DEFAULT_PUZZLE_PROGRESS,
      ...initialProgress,
      ratingProfile: {
        ...DEFAULT_ADAPTIVE_RATING,
        ...(initialProgress?.ratingProfile || {}),
      },
      themeMastery: { ...(initialProgress?.themeMastery || {}) },
      arcadeStats: {
        ...DEFAULT_PUZZLE_PROGRESS.arcadeStats,
        ...(initialProgress?.arcadeStats || {}),
      },
      solvedPuzzles: { ...(initialProgress?.solvedPuzzles || {}) },
    };
  }

  public async getProgress(): Promise<PuzzleProgress> {
    return JSON.parse(JSON.stringify(this.progress));
  }

  public async updateRating(newRatingState: AdaptiveRatingState): Promise<void> {
    this.progress = {
      ...this.progress,
      ratingProfile: {
        ...newRatingState,
        peakRating: Math.max(this.progress.ratingProfile.peakRating, newRatingState.rating),
      },
      lastActiveAt: Date.now(),
    };
  }

  public async recordPuzzleAttempt(
    puzzleId: string,
    theme: PuzzleTheme,
    result: PuzzleAttemptResult,
    stars: StarRating
  ): Promise<PuzzleProgress> {
    const isSuccess = result.startsWith('solved');
    const now = Date.now();

    const newSolvedPuzzles = { ...this.progress.solvedPuzzles };
    if (isSuccess) {
      const existing = newSolvedPuzzles[puzzleId];
      newSolvedPuzzles[puzzleId] = {
        stars: existing ? (Math.max(existing.stars, stars) as StarRating) : stars,
        solvedAt: now,
      };
    }

    const newRatingProfile: AdaptiveRatingState = {
      ...this.progress.ratingProfile,
      totalAttempted: this.progress.ratingProfile.totalAttempted + 1,
      totalSolved: this.progress.ratingProfile.totalSolved + (isSuccess ? 1 : 0),
    };

    const existingTheme = this.progress.themeMastery[theme] || {
      theme,
      attempted: 0,
      solved: 0,
      starsEarned: 0,
      masteryLevel: 'novice' as const,
      lastPracticedAt: now,
    };

    const newSolved = existingTheme.solved + (isSuccess ? 1 : 0);
    const newAttempted = existingTheme.attempted + 1;
    const masteryLevel: 'novice' | 'apprentice' | 'master' =
      newSolved >= 20 ? 'master' : newSolved >= 8 ? 'apprentice' : 'novice';

    const newThemeMastery = {
      ...this.progress.themeMastery,
      [theme]: {
        theme,
        attempted: newAttempted,
        solved: newSolved,
        starsEarned: existingTheme.starsEarned + (isSuccess ? stars : 0),
        masteryLevel,
        lastPracticedAt: now,
      },
    };

    this.progress = {
      ...this.progress,
      solvedPuzzles: newSolvedPuzzles,
      ratingProfile: newRatingProfile,
      themeMastery: newThemeMastery,
      lastActiveAt: now,
    };

    return this.getProgress();
  }

  public async saveArcadeResult(
    mode: 'puzzle_rush' | 'streak_survivor',
    score: number,
    streak: number
  ): Promise<PuzzleProgress> {
    const now = Date.now();
    const newArcade = { ...this.progress.arcadeStats };

    if (mode === 'puzzle_rush') {
      newArcade.puzzleRushHighScore = Math.max(
        newArcade.puzzleRushHighScore,
        score
      );
      newArcade.puzzleRushBestStreak = Math.max(
        newArcade.puzzleRushBestStreak,
        streak
      );
      newArcade.totalRushRuns += 1;
    } else {
      newArcade.streakSurvivorHighScore = Math.max(
        newArcade.streakSurvivorHighScore,
        score
      );
    }

    this.progress = {
      ...this.progress,
      arcadeStats: newArcade,
      lastActiveAt: now,
    };

    return this.getProgress();
  }

  public async restoreProgress(progress: PuzzleProgress): Promise<void> {
    const now = Date.now();
    this.progress = {
      ...DEFAULT_PUZZLE_PROGRESS,
      ...progress,
      ratingProfile: {
        ...DEFAULT_ADAPTIVE_RATING,
        ...(progress?.ratingProfile || {}),
      },
      themeMastery: { ...(progress?.themeMastery || {}) },
      arcadeStats: {
        ...DEFAULT_PUZZLE_PROGRESS.arcadeStats,
        ...(progress?.arcadeStats || {}),
      },
      solvedPuzzles: { ...(progress?.solvedPuzzles || {}) },
      createdAt: typeof progress?.createdAt === 'number' ? progress.createdAt : now,
      lastActiveAt: typeof progress?.lastActiveAt === 'number' ? progress.lastActiveAt : now,
    };
  }

  public async resetAll(): Promise<void> {
    const now = Date.now();
    this.progress = {
      ...DEFAULT_PUZZLE_PROGRESS,
      ratingProfile: { ...DEFAULT_ADAPTIVE_RATING },
      themeMastery: {},
      arcadeStats: { ...DEFAULT_PUZZLE_PROGRESS.arcadeStats },
      solvedPuzzles: {},
      createdAt: now,
      lastActiveAt: now,
    };
  }
}
