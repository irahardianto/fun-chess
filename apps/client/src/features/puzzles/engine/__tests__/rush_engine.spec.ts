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
  });
});
