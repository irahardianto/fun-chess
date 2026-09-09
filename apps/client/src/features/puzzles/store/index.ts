import type { PuzzleProgressStore, IClock } from '@fun-chess/shared';
import {
  LocalStoragePuzzleProgressStore,
  defaultLocalStoragePuzzleProgressStore,
} from './local_storage_puzzle_progress.store';
import { InMemoryPuzzleProgressStore } from './in_memory_puzzle_progress.store';

export * from './puzzle_progress.store';
export * from './local_storage_puzzle_progress.store';
export { InMemoryPuzzleProgressStore } from './in_memory_puzzle_progress.store';


/**
 * Factory function to create a puzzle progress store adapter.
 */
export function createPuzzleProgressStore(
  type: 'local' | 'memory' = 'local',
  clock?: IClock
): PuzzleProgressStore {
  if (type === 'memory') {
    return new InMemoryPuzzleProgressStore(undefined, clock);
  }
  return new LocalStoragePuzzleProgressStore(undefined, undefined, clock);
}

export { defaultLocalStoragePuzzleProgressStore };

