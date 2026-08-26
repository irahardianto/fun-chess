import type {
  ScenarioProgress,
  ScenarioProgressMap,
  ScenarioProgressStore,
  StarRating,
} from '@fun-chess/shared';

/**
 * In-memory test double implementation of ScenarioProgressStore.
 * Provides deterministic behavior without touching window.localStorage.
 */
export class InMemoryProgressStore implements ScenarioProgressStore {
  private progressMap: Map<string, ScenarioProgress> = new Map();

  constructor(initialData?: ScenarioProgressMap) {
    if (initialData) {
      for (const [id, rec] of Object.entries(initialData)) {
        this.progressMap.set(id, { ...rec });
      }
    }
  }

  public async getProgressMap(): Promise<ScenarioProgressMap> {
    const result: ScenarioProgressMap = {};
    for (const [id, rec] of this.progressMap.entries()) {
      result[id] = { ...rec };
    }
    return result;
  }

  public async getProgress(scenarioId: string): Promise<ScenarioProgress | null> {
    const rec = this.progressMap.get(scenarioId);
    return rec ? { ...rec } : null;
  }

  public async saveProgress(
    scenarioId: string,
    stars: StarRating,
    hintsUsed: number
  ): Promise<ScenarioProgress> {
    const existing = this.progressMap.get(scenarioId);
    const now = Date.now();

    const updated: ScenarioProgress = {
      scenarioId,
      starsEarned: existing ? (Math.max(existing.starsEarned, stars) as StarRating) : stars,
      attemptsCount: existing ? existing.attemptsCount + 1 : 1,
      hintsUsedTotal: existing ? existing.hintsUsedTotal + hintsUsed : hintsUsed,
      firstCompletedAt: existing ? existing.firstCompletedAt : now,
      lastCompletedAt: now,
    };

    this.progressMap.set(scenarioId, updated);
    return { ...updated };
  }

  public async resetAllProgress(): Promise<void> {
    this.progressMap.clear();
  }
}
export { InMemoryProgressStore as InMemoryScenarioProgressStore };
