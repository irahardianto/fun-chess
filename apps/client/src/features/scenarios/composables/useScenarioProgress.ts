import { ref, computed, readonly } from 'vue';
import type {
  ScenarioProgress,
  ScenarioProgressMap,
  ScenarioProgressStore,
  ScenarioCategory,
  StarRating,
} from '@fun-chess/shared';
import { defaultLocalStorageProgressStore } from '../store/local_storage_progress.store';
import { ALL_SCENARIOS, CURRICULUM_SECTIONS } from '../data';

export function useScenarioProgress(customStore?: ScenarioProgressStore) {
  const store = customStore || defaultLocalStorageProgressStore;

  const progressMap = ref<ScenarioProgressMap>({});
  const isLoading = ref<boolean>(false);

  async function loadProgress(): Promise<void> {
    isLoading.value = true;
    try {
      progressMap.value = await store.getProgressMap();
    } catch {
      progressMap.value = {};
    } finally {
      isLoading.value = false;
    }
  }

  function getProgress(scenarioId: string): ScenarioProgress | null {
    return progressMap.value[scenarioId] ?? null;
  }

  function getStars(scenarioId: string): StarRating | 0 {
    const record = getProgress(scenarioId);
    return record ? record.starsEarned : 0;
  }

  async function saveProgress(
    scenarioId: string,
    stars: StarRating,
    hintsUsed: number
  ): Promise<ScenarioProgress> {
    const updated = await store.saveProgress(scenarioId, stars, hintsUsed);
    progressMap.value = {
      ...progressMap.value,
      [scenarioId]: updated,
    };
    return updated;
  }

  async function resetAll(): Promise<void> {
    await store.resetAllProgress();
    progressMap.value = {};
  }

  const totalStarsEarned = computed<number>(() => {
    return Object.values(progressMap.value).reduce((sum, item) => sum + item.starsEarned, 0);
  });

  const completedCount = computed<number>(() => {
    return Object.values(progressMap.value).filter((item) => item.starsEarned > 0).length;
  });

  const totalScenarios = computed<number>(() => {
    return ALL_SCENARIOS.length;
  });

  const maxPossibleStars = computed<number>(() => {
    return ALL_SCENARIOS.length * 3;
  });

  function getCategoryStats(category: ScenarioCategory | string): {
    completed: number;
    total: number;
    starsEarned: number;
    maxStars: number;
  } {
    const normalizedCat = category === 'rules_and_basics' ? 'fundamentals' : category;
    const section = CURRICULUM_SECTIONS.find((s) => s.id === normalizedCat || s.id === category);
    if (!section) {
      return { completed: 0, total: 0, starsEarned: 0, maxStars: 0 };
    }

    const total = section.scenarios.length;
    let completed = 0;
    let starsEarned = 0;

    for (const sc of section.scenarios) {
      const rec = progressMap.value[sc.id];
      if (rec && rec.starsEarned > 0) {
        completed++;
        starsEarned += rec.starsEarned;
      }
    }

    return {
      completed,
      total,
      starsEarned,
      maxStars: total * 3,
    };
  }

  // Load initially
  loadProgress();

  return {
    progressMap: readonly(progressMap),
    isLoading: readonly(isLoading),
    totalStarsEarned,
    completedCount,
    totalScenarios,
    maxPossibleStars,
    loadProgress,
    getProgress,
    getStars,
    saveProgress,
    resetAll,
    getCategoryStats,
  };
}
