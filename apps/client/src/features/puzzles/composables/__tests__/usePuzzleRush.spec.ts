import { describe, it, expect, beforeEach, vi } from 'vitest';

import { usePuzzleRush } from '../usePuzzleRush';
import { InMemoryPuzzleProgressStore } from '../../store/in_memory_puzzle_progress.store';

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

  it('logs structured telemetry across game loop lifecycle and score submission (MAJ-029)', async () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    };

    const rush = usePuzzleRush({
      customStore: memoryStore,
      logger: mockLogger as any,
    });

    rush.startRun('puzzle_rush');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Starting puzzle rush run',
      expect.objectContaining({
        operation: 'puzzle_rush_start',
        mode: 'puzzle_rush',
      })
    );

    await rush.handleRunnerSolved();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Puzzle solved during rush run',
      expect.objectContaining({
        operation: 'puzzle_rush_solve',
        mode: 'puzzle_rush',
      })
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Submitting arcade score for puzzle rush',
      expect.objectContaining({
        operation: 'puzzle_rush_submit_score',
        mode: 'puzzle_rush',
      })
    );

    rush.handleRunnerFailed();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Puzzle mistake during rush run',
      expect.objectContaining({
        operation: 'puzzle_rush_mistake',
        mode: 'puzzle_rush',
      })
    );

    rush.stopRun();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Stopping puzzle rush run manually',
      expect.objectContaining({
        operation: 'puzzle_rush_stop',
        mode: 'puzzle_rush',
      })
    );
  });
});

