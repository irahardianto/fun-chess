export * from './engine';
export * from './store';
export * from './data';
export * from './composables';
export * from './components';

export { default as ScenarioArena } from './ScenarioArena.vue';
export * from './ScenarioArena.vue';

// Explicit re-exports of public stores and essential interfaces (MAJ-007)
export {
  LocalStorageProgressStore,
  InMemoryProgressStore,
  createLocalStorageProgressStore,
  createDefaultLocalStorageProgressStore,
  getDefaultLocalStorageProgressStore,
  defaultLocalStorageProgressStore,
  SCENARIO_PROGRESS_STORAGE_KEY,
} from './store';

export type {
  ScenarioProgress,
  ScenarioProgressMap,
  ScenarioProgressStore,
} from './store';
