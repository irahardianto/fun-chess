import { describe, it, expect, beforeEach } from 'vitest';
import { useAdaptiveLadder } from '../useAdaptiveLadder';
import { InMemoryPuzzleProgressStore } from '../../store/in_memory_puzzle_store';

describe('useAdaptiveLadder Composable', () => {
  let memoryStore: InMemoryPuzzleProgressStore;

  beforeEach(() => {
    memoryStore = new InMemoryPuzzleProgressStore();
  });

  it('initializes ladder with target puzzle and player tier', async () => {
    const ladder = useAdaptiveLadder(memoryStore);
    await new Promise((r) => setTimeout(r, 10));

    ladder.startLadder();

    expect(ladder.runner.puzzle.value).toBeDefined();
    expect(ladder.playerRating.value).toBe(800);
    expect(ladder.currentTier.value.id).toBe('pawn_novice');
    expect(ladder.currentStreak.value).toBe(0);
  });

  it('updates rating and streak when solving puzzle in ladder mode', async () => {
    const ladder = useAdaptiveLadder(memoryStore);
    await new Promise((r) => setTimeout(r, 10));

    ladder.startLadder();
    const puzzle = ladder.runner.puzzle.value!;

    await ladder.handleSolved(puzzle, 3, 0, 0);

    expect(ladder.currentStreak.value).toBe(1);
    expect(ladder.lastRatingDelta.value).toBeGreaterThan(0);
  });

  it('reduces rating and resets streak on failure', async () => {
    const ladder = useAdaptiveLadder(memoryStore);
    await new Promise((r) => setTimeout(r, 10));

    ladder.startLadder();
    const puzzle = ladder.runner.puzzle.value!;

    await ladder.handleFailed(puzzle);

    expect(ladder.currentStreak.value).toBe(-1);
  });
});
