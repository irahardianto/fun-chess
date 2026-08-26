import { describe, it, expect, beforeEach } from 'vitest';
import { usePuzzleRush } from '../usePuzzleRush';
import { InMemoryPuzzleProgressStore } from '../../store/in_memory_puzzle_store';

describe('usePuzzleRush Composable', () => {
  let memoryStore: InMemoryPuzzleProgressStore;

  beforeEach(() => {
    memoryStore = new InMemoryPuzzleProgressStore();
  });

  it('starts puzzle rush mode with 180s timer and initial score', () => {
    const rush = usePuzzleRush(memoryStore);
    rush.startRun('puzzle_rush');

    expect(rush.mode.value).toBe('puzzle_rush');
    expect(rush.score.value).toBe(0);
    expect(rush.timeRemainingSeconds.value).toBe(180);
    expect(rush.isTimerRunning.value).toBe(true);
    expect(rush.isGameOver.value).toBe(false);

    rush.stopRun();
    expect(rush.isGameOver.value).toBe(true);
    expect(rush.isTimerRunning.value).toBe(false);
  });

  it('handles solve and accumulates combo multipliers', async () => {
    const rush = usePuzzleRush(memoryStore);
    rush.startRun('puzzle_rush');

    await rush.handleRunnerSolved();
    expect(rush.score.value).toBe(1);
    expect(rush.currentStreak.value).toBe(1);

    rush.stopRun();
  });

  it('starts streak survivor mode with 3 lives', () => {
    const survivor = usePuzzleRush(memoryStore);
    survivor.startRun('streak_survivor');

    expect(survivor.mode.value).toBe('streak_survivor');
    expect(survivor.livesRemaining.value).toBe(3);
    expect(survivor.isTimerRunning.value).toBe(false);

    survivor.handleRunnerFailed();
    expect(survivor.livesRemaining.value).toBe(2);

    survivor.handleRunnerFailed();
    survivor.handleRunnerFailed();
    expect(survivor.isGameOver.value).toBe(true);
  });
});
