import { describe, it, expect } from 'vitest';
import {
  calculateAdaptiveRatingAdjustment,
  selectTargetPuzzleRating,
  getRankTier,
  getRankProgress,
  MIN_ELO_FLOOR,
} from '../adaptive_rating';

describe('Adaptive Rating Engine', () => {
  describe('calculateAdaptiveRatingAdjustment', () => {
    it('awards positive Elo on a successful solve with zero hints', () => {
      const res = calculateAdaptiveRatingAdjustment({
        playerRating: 800,
        playerRd: 350,
        puzzleRating: 800,
        isSuccess: true,
        hintsUsed: 0,
        currentStreak: 1,
      });

      expect(res.delta).toBeGreaterThan(0);
      expect(res.newRating).toBe(800 + res.delta);
      expect(res.streakBonus).toBe(0);
      expect(res.newRd).toBeLessThan(350);
      expect(res.isProtectedByFloor).toBe(false);
    });

    it('grants a streak bonus on 3 or more consecutive clean solves', () => {
      const resWithoutStreak = calculateAdaptiveRatingAdjustment({
        playerRating: 900,
        playerRd: 200,
        puzzleRating: 900,
        isSuccess: true,
        hintsUsed: 0,
        currentStreak: 1,
      });

      const resWithStreak = calculateAdaptiveRatingAdjustment({
        playerRating: 900,
        playerRd: 200,
        puzzleRating: 900,
        isSuccess: true,
        hintsUsed: 0,
        currentStreak: 4,
      });

      expect(resWithStreak.streakBonus).toBeGreaterThan(0);
      expect(resWithStreak.delta).toBeGreaterThan(resWithoutStreak.delta);
    });

    it('applies non-punitive hint damping for young learners', () => {
      const cleanSolve = calculateAdaptiveRatingAdjustment({
        playerRating: 1000,
        playerRd: 200,
        puzzleRating: 1000,
        isSuccess: true,
        hintsUsed: 0,
        currentStreak: 1,
      });

      const hint1Solve = calculateAdaptiveRatingAdjustment({
        playerRating: 1000,
        playerRd: 200,
        puzzleRating: 1000,
        isSuccess: true,
        hintsUsed: 1,
        currentStreak: 1,
      });

      const hint3Solve = calculateAdaptiveRatingAdjustment({
        playerRating: 1000,
        playerRd: 200,
        puzzleRating: 1000,
        isSuccess: true,
        hintsUsed: 3,
        currentStreak: 1,
      });

      expect(hint1Solve.delta).toBeLessThanOrEqual(cleanSolve.delta);
      expect(hint3Solve.delta).toBeLessThanOrEqual(hint1Solve.delta);
      expect(hint3Solve.delta).toBeGreaterThanOrEqual(2);
    });

    it('reduces loss penalty on failed attempts so kids are not discouraged', () => {
      const failed = calculateAdaptiveRatingAdjustment({
        playerRating: 1000,
        playerRd: 200,
        puzzleRating: 1000,
        isSuccess: false,
        hintsUsed: 0,
        currentStreak: 0,
      });

      expect(failed.delta).toBeLessThan(0);
      expect(failed.delta).toBeGreaterThanOrEqual(-12);
    });

    it('enforces floor protection at 500 Elo so rating never drops into negative or ultra-low numbers', () => {
      const lowRatingFailed = calculateAdaptiveRatingAdjustment({
        playerRating: 505,
        playerRd: 200,
        puzzleRating: 500,
        isSuccess: false,
        hintsUsed: 0,
        currentStreak: 0,
      });

      expect(lowRatingFailed.newRating).toBe(MIN_ELO_FLOOR);
      expect(lowRatingFailed.isProtectedByFloor).toBe(true);
    });
  });

  describe('selectTargetPuzzleRating', () => {
    it('increases difficulty when on a winning streak (streak >= 4)', () => {
      const target = selectTargetPuzzleRating(1000, 5);
      expect(target).toBeGreaterThan(1050);
    });

    it('lowers difficulty to build confidence when struggling (streak <= -2)', () => {
      const target = selectTargetPuzzleRating(1000, -3);
      expect(target).toBeLessThan(1000);
      expect(target).toBeGreaterThanOrEqual(MIN_ELO_FLOOR);
    });

    it('stays in standard comfort zone for normal streaks', () => {
      const target = selectTargetPuzzleRating(1000, 1);
      expect(target).toBe(980);
    });
  });

  describe('Kid Rank Tiers & Progress', () => {
    it('determines the correct tier based on Elo rating', () => {
      expect(getRankTier(700).id).toBe('pawn_novice');
      expect(getRankTier(1050).id).toBe('knight_scout');
      expect(getRankTier(1250).id).toBe('bishop_tactician');
      expect(getRankTier(1450).id).toBe('rook_guardian');
      expect(getRankTier(1650).id).toBe('queen_champion');
      expect(getRankTier(1900).id).toBe('grandmaster_legend');
    });

    it('calculates tier progress and points needed to reach next tier', () => {
      const progress = getRankProgress(1050);
      expect(progress.currentTier.id).toBe('knight_scout');
      expect(progress.nextTier?.id).toBe('bishop_tactician');
      expect(progress.percent).toBeGreaterThan(0);
      expect(progress.percent).toBeLessThan(100);
      expect(progress.pointsToNext).toBe(150); // 1200 - 1050
    });

    it('handles top tier maxed progress', () => {
      const progress = getRankProgress(2000);
      expect(progress.currentTier.id).toBe('grandmaster_legend');
      expect(progress.nextTier).toBeNull();
      expect(progress.percent).toBe(100);
      expect(progress.pointsToNext).toBe(0);
    });
  });
});
