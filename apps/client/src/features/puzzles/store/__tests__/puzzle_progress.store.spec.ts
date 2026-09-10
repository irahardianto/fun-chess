import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { IClock, PuzzleProgress, AdaptiveRatingState } from '@fun-chess/shared';
import {
  usePuzzleProgressStore,
  createDefaultPuzzleProgress,
  DEFAULT_ADAPTIVE_RATING,
  DEFAULT_PUZZLE_PROGRESS,
} from '../puzzle_progress.store';

describe('usePuzzleProgressStore (Pinia Setup Store - MAJ-018 & MIN-010)', () => {
  const fixedTimestamp = 1700000000000;
  const mockClock: IClock = {
    now: () => fixedTimestamp,
  };

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('createDefaultPuzzleProgress (Pure Factory - MIN-010)', () => {
    it('creates deterministic default puzzle progress using custom clock', () => {
      const state = createDefaultPuzzleProgress(mockClock);

      expect(state.createdAt).toBe(fixedTimestamp);
      expect(state.lastActiveAt).toBe(fixedTimestamp);
      expect(state.ratingProfile.rating).toBe(800);
      expect(state.ratingProfile.peakRating).toBe(800);
      expect(state.ratingProfile.totalAttempted).toBe(0);
      expect(state.ratingProfile.totalSolved).toBe(0);
      expect(state.arcadeStats.puzzleRushHighScore).toBe(0);
      expect(state.arcadeStats.puzzleRushBestStreak).toBe(0);
      expect(Object.keys(state.solvedPuzzles)).toHaveLength(0);
      expect(Object.keys(state.themeMastery)).toHaveLength(0);
    });

    it('creates decoupled state instances on successive calls', () => {
      const stateA = createDefaultPuzzleProgress(mockClock);
      const stateB = createDefaultPuzzleProgress(mockClock);

      expect(stateA).not.toBe(stateB);
      expect(stateA.ratingProfile).not.toBe(stateB.ratingProfile);
      expect(stateA.arcadeStats).not.toBe(stateB.arcadeStats);
      expect(stateA.solvedPuzzles).not.toBe(stateB.solvedPuzzles);
      expect(stateA.themeMastery).not.toBe(stateB.themeMastery);
    });

    it('exports DEFAULT_PUZZLE_PROGRESS as an immutable frozen snapshot with deterministic timestamp', () => {
      expect(DEFAULT_PUZZLE_PROGRESS).toBeDefined();
      expect(DEFAULT_PUZZLE_PROGRESS.createdAt).toBe(0);
      expect(DEFAULT_PUZZLE_PROGRESS.lastActiveAt).toBe(0);
      expect(Object.isFrozen(DEFAULT_PUZZLE_PROGRESS)).toBe(true);
    });
  });

  describe('Pinia Setup Store Reactive State & Getters', () => {
    it('initializes store with default progress and reactive getters', () => {
      const store = usePuzzleProgressStore();

      expect(store.isLoaded).toBe(false);
      expect(store.currentRating).toBe(800);
      expect(store.peakRating).toBe(800);
      expect(store.totalSolved).toBe(0);
      expect(store.totalAttempted).toBe(0);
      expect(store.rushHighScore).toBe(0);
      expect(store.rushBestStreak).toBe(0);
      expect(store.survivorHighScore).toBe(0);
      expect(store.totalRushRuns).toBe(0);
    });

    it('sets progress and marks store as loaded via setProgress', () => {
      const store = usePuzzleProgressStore();
      const customProgress: PuzzleProgress = {
        ...createDefaultPuzzleProgress(mockClock),
        ratingProfile: {
          ...DEFAULT_ADAPTIVE_RATING,
          rating: 1450,
          peakRating: 1500,
          totalAttempted: 25,
          totalSolved: 20,
        },
        solvedPuzzles: {
          puz_1: { stars: 3, solvedAt: fixedTimestamp },
          puz_2: { stars: 2, solvedAt: fixedTimestamp },
        },
      };

      store.setProgress(customProgress);

      expect(store.isLoaded).toBe(true);
      expect(store.currentRating).toBe(1450);
      expect(store.peakRating).toBe(1500);
      expect(store.totalSolved).toBe(2);
      expect(store.totalAttempted).toBe(25);
    });
  });

  describe('Pinia Store Actions', () => {
    it('updates rating and adjusts peakRating via updateRating', () => {
      const store = usePuzzleProgressStore();
      const newRating: AdaptiveRatingState = {
        rating: 1350,
        ratingDeviation: 120,
        peakRating: 1300, // lower than rating to verify Math.max
        totalAttempted: 10,
        totalSolved: 8,
        bestStreak: 4,
        ratingHistory: [],
      };

      store.updateRating(newRating, mockClock);

      expect(store.currentRating).toBe(1350);
      expect(store.peakRating).toBe(1350);
      expect(store.progress.lastActiveAt).toBe(fixedTimestamp);
    });

    it('records attempt with full signature and updates theme mastery & solved records', () => {
      const store = usePuzzleProgressStore();

      const updated = store.recordAttempt(
        'puz_pin_01',
        'pin',
        'solved_first_try',
        3,
        mockClock
      );

      expect(updated).toBeDefined();
      expect(store.totalSolved).toBe(1);
      expect(store.totalAttempted).toBe(1);
      expect(store.progress.solvedPuzzles['puz_pin_01']).toEqual({
        stars: 3,
        solvedAt: fixedTimestamp,
      });

      const pinMastery = store.progress.themeMastery['pin'];
      expect(pinMastery).toBeDefined();
      expect(pinMastery?.solved).toBe(1);
      expect(pinMastery?.attempted).toBe(1);
      expect(pinMastery?.starsEarned).toBe(3);
      expect(pinMastery?.masteryLevel).toBe('novice');
      expect(pinMastery?.lastPracticedAt).toBe(fixedTimestamp);
    });

    it('records attempt with shorthand (result, clock) signature', () => {
      const store = usePuzzleProgressStore();

      store.recordAttempt('solved_with_hints', mockClock);

      expect(store.totalAttempted).toBe(1);
      expect(store.progress.ratingProfile.totalSolved).toBe(1);
      expect(store.progress.lastActiveAt).toBe(fixedTimestamp);

      store.recordAttempt('failed', mockClock);

      expect(store.totalAttempted).toBe(2);
      expect(store.progress.ratingProfile.totalSolved).toBe(1);
      expect(store.progress.lastActiveAt).toBe(fixedTimestamp);
    });

    it('saves arcade results for puzzle rush and streak survivor', () => {
      const store = usePuzzleProgressStore();

      store.saveArcadeResult('puzzle_rush', 18, 7, mockClock);

      expect(store.rushHighScore).toBe(18);
      expect(store.rushBestStreak).toBe(7);
      expect(store.totalRushRuns).toBe(1);
      expect(store.progress.lastActiveAt).toBe(fixedTimestamp);

      // Higher score updates high score
      store.saveArcadeResult('puzzle_rush', 22, 5, mockClock);
      expect(store.rushHighScore).toBe(22);
      expect(store.rushBestStreak).toBe(7); // streak 7 > 5 retained
      expect(store.totalRushRuns).toBe(2);

      // Streak survivor mode
      store.saveArcadeResult('streak_survivor', 15, 10, mockClock);
      expect(store.survivorHighScore).toBe(15);
    });

    it('restores progress atomically via restoreProgress', () => {
      const store = usePuzzleProgressStore();
      const restoredProgress: PuzzleProgress = {
        ratingProfile: {
          rating: 1600,
          ratingDeviation: 90,
          peakRating: 1650,
          totalAttempted: 100,
          totalSolved: 80,
          bestStreak: 15,
          ratingHistory: [],
        },
        themeMastery: {},
        arcadeStats: {
          puzzleRushHighScore: 30,
          puzzleRushBestStreak: 12,
          streakSurvivorHighScore: 25,
          totalRushRuns: 10,
        },
        solvedPuzzles: {},
        createdAt: 5000,
        lastActiveAt: 6000,
      };

      store.restoreProgress(restoredProgress, mockClock);

      expect(store.isLoaded).toBe(true);
      expect(store.currentRating).toBe(1600);
      expect(store.peakRating).toBe(1650);
      expect(store.rushHighScore).toBe(30);
      expect(store.survivorHighScore).toBe(25);
    });

    it('resets state deterministically using resetState and $reset', () => {
      const store = usePuzzleProgressStore();
      store.recordAttempt('puz_1', 'fork', 'solved_first_try', 3, mockClock);
      expect(store.totalSolved).toBe(1);

      store.resetState(mockClock);

      expect(store.totalSolved).toBe(0);
      expect(store.totalAttempted).toBe(0);
      expect(store.isLoaded).toBe(false);
      expect(store.progress.createdAt).toBe(fixedTimestamp);

      // Verify $reset works identically
      store.recordAttempt('puz_2', 'fork', 'solved_first_try', 3, mockClock);
      expect(store.totalSolved).toBe(1);

      store.$reset();
      expect(store.totalSolved).toBe(0);
      expect(store.isLoaded).toBe(false);
    });
  });
});
