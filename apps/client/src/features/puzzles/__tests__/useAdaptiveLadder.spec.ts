import { describe, it, expect } from 'vitest';
import { useAdaptiveLadder } from '../composables/useAdaptiveLadder';
import { InMemoryPuzzleProgressStore } from '../store/in_memory_puzzle_progress.store';

describe('useAdaptiveLadder Composable', () => {
  it('initializes ladder state from store', () => {
    const store = new InMemoryPuzzleProgressStore();
    const ladder = useAdaptiveLadder(store);

    expect(ladder.currentElo.value).toBe(800);
    expect(ladder.rankTier.value.id).toBe('pawn_novice');
    expect(ladder.currentPuzzle.value).not.toBeNull();
  });

  it('handles solve and increases rating and streak', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const ladder = useAdaptiveLadder(store);
    const puzzle = ladder.currentPuzzle.value!;

    await ladder.handleSolve(puzzle, 3, 0);

    expect(ladder.currentStreak.value).toBe(1);
    expect(ladder.currentElo.value).toBeGreaterThan(800);
  });
});
