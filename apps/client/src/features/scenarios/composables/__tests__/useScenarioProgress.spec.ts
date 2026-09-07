import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScenarioProgress } from '../useScenarioProgress';
import { InMemoryProgressStore } from '../../store/in_memory_progress.store';

describe('useScenarioProgress', () => {
  let mockStore: InMemoryProgressStore;

  beforeEach(() => {
    mockStore = new InMemoryProgressStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes and computes star progress from store', async () => {
    await mockStore.saveProgress('pawn-journey', 3, 0);
    await mockStore.saveProgress('knight-jumps', 2, 1);

    const progressComposable = useScenarioProgress(mockStore);
    await progressComposable.loadProgress();

    expect(progressComposable.totalStarsEarned.value).toBe(5);
    expect(progressComposable.completedCount.value).toBe(2);
    expect(progressComposable.totalScenarios.value).toBeGreaterThan(0);
    expect(progressComposable.getStars('pawn-journey')).toBe(3);
    expect(progressComposable.getStars('knight-jumps')).toBe(2);
    expect(progressComposable.getStars('unstarted-lesson')).toBe(0);
  });

  it('saves progress and updates reactive state map', async () => {
    const progressComposable = useScenarioProgress(mockStore);
    await progressComposable.loadProgress();

    expect(progressComposable.totalStarsEarned.value).toBe(0);

    const saved = await progressComposable.saveProgress('royal-fork', 3, 0);
    expect(saved.starsEarned).toBe(3);
    expect(progressComposable.totalStarsEarned.value).toBe(3);
    expect(progressComposable.completedCount.value).toBe(1);

    const record = progressComposable.getProgress('royal-fork');
    expect(record?.starsEarned).toBe(3);
  });

  it('calculates category-specific stats', async () => {
    await mockStore.saveProgress('pawn-journey', 3, 0);
    await mockStore.saveProgress('rook-lines', 3, 0);

    const progressComposable = useScenarioProgress(mockStore);
    await progressComposable.loadProgress();

    const rulesStats = progressComposable.getCategoryStats('fundamentals');
    expect(rulesStats.total).toBe(8);
    expect(rulesStats.completed).toBe(2);
    expect(rulesStats.starsEarned).toBe(6);
    expect(rulesStats.maxStars).toBe(24);
  });

  it('resets all progress cleanly via resetAll', async () => {
    await mockStore.saveProgress('lesson-1', 3, 0);

    const progressComposable = useScenarioProgress(mockStore);
    await progressComposable.loadProgress();
    expect(progressComposable.completedCount.value).toBe(1);

    await progressComposable.resetAll();
    expect(progressComposable.completedCount.value).toBe(0);
    expect(progressComposable.totalStarsEarned.value).toBe(0);
    expect(progressComposable.progressMap.value).toEqual({});
  });
});
