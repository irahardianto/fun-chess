import { describe, it, expect, beforeEach } from 'vitest';
import { useThemedDrills } from '../useThemedDrills';
import { InMemoryPuzzleProgressStore } from '../../store/in_memory_puzzle_store';

describe('useThemedDrills Composable', () => {
  let memoryStore: InMemoryPuzzleProgressStore;

  beforeEach(() => {
    memoryStore = new InMemoryPuzzleProgressStore();
  });

  it('initializes drill playlist for a chosen theme', () => {
    const drills = useThemedDrills('fork', memoryStore);

    expect(drills.activeTheme.value).toBe('fork');
    expect(drills.totalInTheme.value).toBeGreaterThan(0);
    expect(drills.currentDrillIndex.value).toBe(0);
    expect(drills.currentPuzzle.value).toBeDefined();
  });

  it('navigates through drills playlist sequentially', () => {
    const drills = useThemedDrills('fork', memoryStore);

    drills.nextDrill();
    expect(drills.currentDrillIndex.value).toBe(1);

    drills.previousDrill();
    expect(drills.currentDrillIndex.value).toBe(0);
  });

  it('switches theme and resets session counter', () => {
    const drills = useThemedDrills('fork', memoryStore);

    drills.selectTheme('pin');
    expect(drills.activeTheme.value).toBe('pin');
    expect(drills.currentDrillIndex.value).toBe(0);
    expect(drills.solvedInSessionCount.value).toBe(0);
  });
});
