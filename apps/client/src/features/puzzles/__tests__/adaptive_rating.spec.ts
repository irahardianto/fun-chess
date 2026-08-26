import { describe, it, expect } from 'vitest';
import {
  calculateAdaptiveRatingAdjustment,
  selectTargetPuzzleRating,
  getRankTierForElo,
} from '../engine/adaptive_rating';

describe('Adaptive Rating Engine', () => {
  it('awards rating gain on successful solve without hints', () => {
    const result = calculateAdaptiveRatingAdjustment({
      playerRating: 800,
      playerRd: 200,
      puzzleRating: 850,
      isSuccess: true,
      hintsUsed: 0,
      currentStreak: 1,
    });

    expect(result.delta).toBeGreaterThan(0);
    expect(result.newRating).toBe(800 + result.delta);
    expect(result.newRd).toBeLessThan(200);
  });

  it('reduces rating gain when hints are used', () => {
    const withoutHint = calculateAdaptiveRatingAdjustment({
      playerRating: 900,
      playerRd: 150,
      puzzleRating: 900,
      isSuccess: true,
      hintsUsed: 0,
      currentStreak: 1,
    });

    const withTier3Hint = calculateAdaptiveRatingAdjustment({
      playerRating: 900,
      playerRd: 150,
      puzzleRating: 900,
      isSuccess: true,
      hintsUsed: 3,
      currentStreak: 1,
    });

    expect(withTier3Hint.delta).toBeLessThan(withoutHint.delta);
    expect(withTier3Hint.delta).toBeGreaterThan(0);
  });

  it('protects kid rating with 500 Elo floor on failure', () => {
    const result = calculateAdaptiveRatingAdjustment({
      playerRating: 502,
      playerRd: 150,
      puzzleRating: 500,
      isSuccess: false,
      hintsUsed: 0,
      currentStreak: 0,
    });

    expect(result.newRating).toBe(500);
    expect(result.isProtectedByFloor).toBe(true);
  });

  it('selects target puzzle rating adjusted for streak', () => {
    const coldTarget = selectTargetPuzzleRating(800, 0);
    const hotTarget = selectTargetPuzzleRating(800, 4);

    expect(hotTarget).toBeGreaterThan(coldTarget);
  });

  it('maps Elo to correct rank tier badge', () => {
    expect(getRankTierForElo(600).id).toBe('pawn_novice');
    expect(getRankTierForElo(1050).id).toBe('knight_scout');
    expect(getRankTierForElo(1250).id).toBe('bishop_tactician');
    expect(getRankTierForElo(1450).id).toBe('rook_guardian');
    expect(getRankTierForElo(1650).id).toBe('queen_champion');
  });
});
