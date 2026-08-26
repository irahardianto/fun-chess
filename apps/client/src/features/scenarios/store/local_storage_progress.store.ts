import type {
  ScenarioProgress,
  ScenarioProgressMap,
  ScenarioProgressStore,
  StarRating,
} from '@fun-chess/shared';

export const SCENARIO_PROGRESS_STORAGE_KEY = 'fun_chess_scenario_progress_v1';

/**
 * Robust localStorage implementation of ScenarioProgressStore.
 * Includes defensive JSON parsing, runtime type narrowing, error boundaries,
 * and an automatic in-memory fallback if localStorage is unavailable.
 */
export class LocalStorageProgressStore implements ScenarioProgressStore {
  private readonly storageKey: string;
  private memoryFallback: Map<string, ScenarioProgress> = new Map();

  constructor(storageKey: string = SCENARIO_PROGRESS_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  private isStorageAvailable(): boolean {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false;
    }
    try {
      const testKey = `__fc_test_${Date.now()}__`;
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeRecord(raw: unknown): ScenarioProgress | null {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;

    if (typeof item.scenarioId !== 'string' || !item.scenarioId) {
      return null;
    }

    const starsEarned = Number(item.starsEarned);
    const validStars: StarRating =
      starsEarned === 3 ? 3 : starsEarned === 2 ? 2 : starsEarned === 1 ? 1 : 1;

    const attemptsCount = typeof item.attemptsCount === 'number' && item.attemptsCount > 0
      ? item.attemptsCount
      : 1;

    const hintsUsedTotal = typeof item.hintsUsedTotal === 'number' && item.hintsUsedTotal >= 0
      ? item.hintsUsedTotal
      : 0;

    const now = Date.now();
    const firstCompletedAt = typeof item.firstCompletedAt === 'number' && item.firstCompletedAt > 0
      ? item.firstCompletedAt
      : now;

    const lastCompletedAt = typeof item.lastCompletedAt === 'number' && item.lastCompletedAt > 0
      ? item.lastCompletedAt
      : now;

    return {
      scenarioId: item.scenarioId,
      starsEarned: validStars,
      attemptsCount,
      hintsUsedTotal,
      firstCompletedAt,
      lastCompletedAt,
    };
  }

  public async getProgressMap(): Promise<ScenarioProgressMap> {
    if (!this.isStorageAvailable()) {
      const result: ScenarioProgressMap = {};
      for (const [id, rec] of this.memoryFallback.entries()) {
        result[id] = { ...rec };
      }
      return result;
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return {};

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      const result: ScenarioProgressMap = {};
      for (const [key, val] of Object.entries(parsed)) {
        const sanitized = this.sanitizeRecord(val);
        if (sanitized) {
          result[key] = sanitized;
          this.memoryFallback.set(key, sanitized);
        }
      }
      return result;
    } catch {
      // Fall back safely to memory cache
      const result: ScenarioProgressMap = {};
      for (const [id, rec] of this.memoryFallback.entries()) {
        result[id] = { ...rec };
      }
      return result;
    }
  }

  public async getProgress(scenarioId: string): Promise<ScenarioProgress | null> {
    const map = await this.getProgressMap();
    return map[scenarioId] ? { ...map[scenarioId] } : null;
  }

  public async saveProgress(
    scenarioId: string,
    stars: StarRating,
    hintsUsed: number
  ): Promise<ScenarioProgress> {
    const currentMap = await this.getProgressMap();
    const existing = currentMap[scenarioId];
    const now = Date.now();

    const updated: ScenarioProgress = {
      scenarioId,
      starsEarned: existing ? (Math.max(existing.starsEarned, stars) as StarRating) : stars,
      attemptsCount: existing ? existing.attemptsCount + 1 : 1,
      hintsUsedTotal: existing ? existing.hintsUsedTotal + hintsUsed : hintsUsed,
      firstCompletedAt: existing ? existing.firstCompletedAt : now,
      lastCompletedAt: now,
    };

    currentMap[scenarioId] = updated;
    this.memoryFallback.set(scenarioId, updated);

    if (this.isStorageAvailable()) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(currentMap));
      } catch {
        // Fallback already updated in memoryFallback
      }
    }

    return { ...updated };
  }

  public async resetAllProgress(): Promise<void> {
    this.memoryFallback.clear();
    if (this.isStorageAvailable()) {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // Safe ignore
      }
    }
  }
}

export const defaultLocalStorageProgressStore = new LocalStorageProgressStore();
