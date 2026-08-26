import { describe, it, expect, beforeEach } from 'vitest';
import { usePuzzleProgress } from '../usePuzzleProgress';
import { InMemoryPuzzleProgressStore } from '../../store/in_memory_puzzle_store';

describe('usePuzzleProgress Composable', () => {
  let memoryStore: InMemoryPuzzleProgressStore;

  beforeEach(() => {
    memoryStore = new InMemoryPuzzleProgressStore();
  });

  it('initializes reactive state from store', async () => {
    const { currentElo, totalSolvedCount, rushHighScore, isLoading } = usePuzzleProgress(memoryStore);

    // Wait microtask for load
    await new Promise((r) => setTimeout(r, 10));

    expect(isLoading.value).toBe(false);
    expect(currentElo.value).toBe(800);
    expect(totalSolvedCount.value).toBe(0);
    expect(rushHighScore.value).toBe(0);
  });

  it('records attempt and reactively updates computed properties', async () => {
    const hook = usePuzzleProgress(memoryStore);
    await new Promise((r) => setTimeout(r, 10));

    await hook.recordAttempt('puz_001', 'fork', 'solved_first_try', 3);

    expect(hook.totalSolvedCount.value).toBe(1);
    expect(hook.isPuzzleSolved('puz_001')).toBe(true);
    expect(hook.getPuzzleStars('puz_001')).toBe(3);

    const forkMastery = hook.getThemeMastery('fork');
    expect(forkMastery?.solved).toBe(1);
  });

  it('updates adaptive rating and saves arcade scores reactively', async () => {
    const hook = usePuzzleProgress(memoryStore);
    await new Promise((r) => setTimeout(r, 10));

    await hook.updateRating({
      rating: 1050,
      ratingDeviation: 200,
      peakRating: 1050,
      totalAttempted: 1,
      totalSolved: 1,
      bestStreak: 1,
      ratingHistory: [],
    });

    expect(hook.currentElo.value).toBe(1050);
    expect(hook.peakElo.value).toBe(1050);

    await hook.saveArcadeResult('puzzle_rush', 10, 4);
    expect(hook.rushHighScore.value).toBe(10);
  });
});
