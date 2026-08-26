import { describe, it, expect } from 'vitest';
import {
  applyRushSolve,
  applyRushStrike,
  calculateRushTimeTick,
  getComboMultiplier,
  getFlameStage,
  getFlameLabel,
} from '../engine/rush_engine';

describe('Puzzle Rush Engine', () => {
  it('increments score, streak and awards +5s bonus on solve', () => {
    const res = applyRushSolve(5, 2, 10);
    expect(res.newScore).toBe(6);
    expect(res.newStreak).toBe(3);
    expect(res.timeBonusSeconds).toBe(5);
    expect(res.comboMultiplier).toBe(2);
    expect(res.isNewHighScore).toBe(false);
  });

  it('detects new high score', () => {
    const res = applyRushSolve(10, 4, 10);
    expect(res.newScore).toBe(11);
    expect(res.isNewHighScore).toBe(true);
  });

  it('increments strikes and triggers game over on reaching max strikes', () => {
    const strike1 = applyRushStrike(0, 3);
    expect(strike1.newStrikes).toBe(1);
    expect(strike1.isGameOver).toBe(false);

    const strike3 = applyRushStrike(2, 3);
    expect(strike3.newStrikes).toBe(3);
    expect(strike3.isGameOver).toBe(true);
  });

  it('calculates timer tick and expiry', () => {
    const tick1 = calculateRushTimeTick(100, 1);
    expect(tick1.timeRemainingSeconds).toBe(99);
    expect(tick1.isExpired).toBe(false);

    const tickExpired = calculateRushTimeTick(1, 1);
    expect(tickExpired.timeRemainingSeconds).toBe(0);
    expect(tickExpired.isExpired).toBe(true);
  });

  it('computes combo multiplier and flame stages', () => {
    expect(getComboMultiplier(0)).toBe(1);
    expect(getComboMultiplier(2)).toBe(2);
    expect(getComboMultiplier(5)).toBe(3);

    expect(getFlameStage(0)).toBe('none');
    expect(getFlameStage(2)).toBe('spark');
    expect(getFlameStage(4)).toBe('blaze');
    expect(getFlameStage(6)).toBe('inferno');

    expect(getFlameLabel(2)).toContain('STREAK');
    expect(getFlameLabel(4)).toContain('ON FIRE');
    expect(getFlameLabel(6)).toContain('INFERNO');
  });
});
