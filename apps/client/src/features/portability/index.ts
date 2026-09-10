export * from './store';
export * from './services';
export * from './composables';
export * from './components';
export * from './engine/sync_validator';

// Explicit re-exports of public stores and essential interfaces (MAJ-007)
export {
  LocalStorageUnifiedStore,
  InMemoryUnifiedStoreMock,
  StorageCommitError,
} from './store';

export type {
  UnifiedProgressPayload,
  ProgressStorage,
} from '@fun-chess/shared';
