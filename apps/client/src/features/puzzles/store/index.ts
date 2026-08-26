import type { PuzzleProgressStore } from '@fun-chess/shared';
import { LocalStoragePuzzleProgressStore, defaultLocalStoragePuzzleProgressStore } from './local_storage_puzzle_store';
import { InMemoryPuzzleProgressStore } from './in_memory_puzzle_store';

export * from './puzzle_progress.store';
export * from './local_storage_puzzle_store';
export * from './in_memory_puzzle_store';

/**
 * Factory function to create a puzzle progress store adapter.
 */
export function createPuzzleProgressStore(type: 'local' | 'memory' = 'local'): PuzzleProgressStore {
  if (type === 'memory') {
    return new InMemoryPuzzleProgressStore();
  }
  return new LocalStoragePuzzleProgressStore();
}

export { defaultLocalStoragePuzzleProgressStore };
