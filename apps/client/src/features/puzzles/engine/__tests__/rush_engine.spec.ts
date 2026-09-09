import { describe, it, expect } from 'vitest';
import {
  calculateTimeTick,
  applyRushSolve,
  applyRushStrike,
  applySurvivorSolve,
  applySurvivorStrike,
  PurePuzzleRushRules,
} from '../rush_engine';

describe('Puzzle Rush & Survivor Engine', () => {
  const rules = new PurePuzzleRushRules();

  describe('Time Ticks', () => {
    it('decrements time remaining and detects expiration', () => {
      const normalTick = calculateTimeTick(180, 1);
      expect(normalTick.timeRemainingSeconds).toBe(179);
      expect(normalTick.isExpired).toBe(false);

      const expiredTick = calculateTimeTick(0.5, 1);
      expect(expiredTick.timeRemainingSeconds).toBe(0);
      expect(expiredTick.isExpired).toBe(true);
    });
  });

  describe('Puzzle Rush Scoring & Combo Multipliers', () => {
    it('calculates score and basic 1x multiplier for early streak', () => {
      const res = rules.applySolve(0, 0, 10, 8000);
      expect(res.newScore).toBe(1);
      expect(res.newStreak).toBe(1);
      expect(res.comboMultiplier).toBe(1);
      expect(res.timeBonusSeconds).toBe(0);
      expect(res.isNewHighScore).toBe(false);
    });

    it('escalates to 2x combo multiplier at 3+ streak', () => {
      const res = rules.applySolve(2, 2, 10, 6000);
      expect(res.newScore).toBe(3);
      expect(res.newStreak).toBe(3);
      expect(res.comboMultiplier).toBe(2);
    });

    it('escalates to 3x combo multiplier at 5+ streak', () => {
      const res = rules.applySolve(4, 4, 10, 6000);
      expect(res.newScore).toBe(5);
      expect(res.newStreak).toBe(5);
      expect(res.comboMultiplier).toBe(3);
    });

    it('awards +5s speed bonus on fast solves under 5 seconds when on a streak', () => {
      const fastSolve = applyRushSolve(3, 3, 10, 3200);
      expect(fastSolve.timeBonusSeconds).toBe(5);
    });

    it('detects when player sets a new high score', () => {
      const res = applyRushSolve(10, 5, 10, 4000);
      expect(res.newScore).toBe(11);
      expect(res.isNewHighScore).toBe(true);
    });
  });

  describe('Puzzle Rush Strikes & Lives', () => {
    it('increments strike counter and resets combo streak', () => {
      const strike1 = applyRushStrike(0, 3);
      expect(strike1.newStrikes).toBe(1);
      expect(strike1.isGameOver).toBe(false);
      expect(strike1.comboReset).toBe(true);

      const strike3 = applyRushStrike(2, 3);
      expect(strike3.newStrikes).toBe(3);
      expect(strike3.isGameOver).toBe(true);
    });
  });

  describe('Streak Survivor Mode', () => {
    it('tracks survivor solve scores and all-time best streak', () => {
      const res = applySurvivorSolve(5, 5, 5);
      expect(res.newScore).toBe(6);
      expect(res.newStreak).toBe(6);
      expect(res.bestStreak).toBe(6);
      expect(res.isNewBestStreak).toBe(true);
    });

    it('handles survivor strikes and ends game when all 3 lives are lost', () => {
      const strike1 = applySurvivorStrike(3, 3);
      expect(strike1.livesRemaining).toBe(2);
      expect(strike1.isGameOver).toBe(false);

      const strike3 = applySurvivorStrike(1, 3);
      expect(strike3.livesRemaining).toBe(0);
      expect(strike3.isGameOver).toBe(true);
    });

    it('does not set isNewBestStreak when current streak is less than or equal to best streak', () => {
      const res = applySurvivorSolve(2, 2, 10);
      expect(res.newScore).toBe(3);
      expect(res.newStreak).toBe(3);
      expect(res.bestStreak).toBe(10);
      expect(res.isNewBestStreak).toBe(false);
    });
  });

  describe('Flame stages and labels', () => {
    it('evaluates flame stages and labels for various streaks', async () => {
      const { getFlameStage, getFlameLabel, getComboMultiplier, calculateRushTimeTick } = await import('../rush_engine');

      expect(getFlameStage(0)).toBe('none');
      expect(getFlameLabel(0)).toBe('');

      expect(getFlameStage(1)).toBe('none');
      expect(getFlameLabel(1)).toBe('');

      expect(getFlameStage(2)).toBe('spark');
      expect(getFlameLabel(2)).toBe('✨ Streak Active');

      expect(getFlameStage(3)).toBe('spark');
      expect(getFlameLabel(3)).toBe('✨ Streak Active');

      expect(getFlameStage(4)).toBe('blaze');
      expect(getFlameLabel(4)).toBe('⚡ On Fire (2x)');

      expect(getFlameStage(5)).toBe('blaze');
      expect(getFlameLabel(5)).toBe('⚡ On Fire (2x)');

      expect(getFlameStage(6)).toBe('inferno');
      expect(getFlameLabel(6)).toBe('🔥 Inferno Streak (3x)');

      expect(getFlameStage(10)).toBe('inferno');
      expect(getFlameLabel(10)).toBe('🔥 Inferno Streak (3x)');

      expect(getComboMultiplier(0)).toBe(1);
      expect(getComboMultiplier(1)).toBe(1);
      expect(getComboMultiplier(2)).toBe(2);
      expect(getComboMultiplier(4)).toBe(2);
      expect(getComboMultiplier(5)).toBe(3);
      expect(getComboMultiplier(10)).toBe(3);

      expect(calculateRushTimeTick(10, 2)).toEqual({
        timeRemainingSeconds: 8,
        isExpired: false,
      });
    });
  });
});
