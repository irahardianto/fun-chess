import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePuzzleRush } from '../composables/usePuzzleRush';
import { InMemoryPuzzleProgressStore } from '../store/in_memory_puzzle_progress.store';

describe('usePuzzleRush Composable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs blitz timer and decrements seconds', () => {
    const store = new InMemoryPuzzleProgressStore();
    const rush = usePuzzleRush({ subMode: 'puzzle_rush', customStore: store, initialDurationSeconds: 180 });

    rush.startRun();
    expect(rush.isTimerRunning.value).toBe(true);
    expect(rush.timeRemainingSeconds.value).toBe(180);

    vi.advanceTimersByTime(3000);
    expect(rush.timeRemainingSeconds.value).toBe(177);

    rush.stopTimer();
  });

  it('handles solve with score increment and +5s bonus in blitz', () => {
    const store = new InMemoryPuzzleProgressStore();
    const rush = usePuzzleRush({ subMode: 'puzzle_rush', customStore: store, initialDurationSeconds: 100 });

    rush.startRun();
    rush.handleSolve();

    expect(rush.score.value).toBe(1);
    expect(rush.currentStreak.value).toBe(1);
    expect(rush.timeRemainingSeconds.value).toBe(105);

    rush.stopTimer();
  });

  it('handles strikes and ends game when reaching max strikes', () => {
    const store = new InMemoryPuzzleProgressStore();
    const rush = usePuzzleRush({ subMode: 'streak_survivor', customStore: store, maxStrikes: 3 });

    rush.startRun();
    rush.handleStrike();
    expect(rush.strikes.value).toBe(1);
    expect(rush.isGameOver.value).toBe(false);

    rush.handleStrike();
    rush.handleStrike();
    expect(rush.strikes.value).toBe(3);
    expect(rush.isGameOver.value).toBe(true);
  });
});
