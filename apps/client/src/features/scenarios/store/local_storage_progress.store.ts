import type {
  ScenarioProgress,
  ScenarioProgressMap,
  ScenarioProgressStore,
  StarRating,
  IClock,
} from '@fun-chess/shared';
import { safeLocalStorage, STORAGE_KEYS, type KeyValueStorage } from '@/platform/storage';
import { isQuotaExceededError, storageAlertDispatcher } from '@/platform/storage/storage_alert';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';
import { SystemClock } from '@/platform/time';

export const SCENARIO_PROGRESS_STORAGE_KEY = STORAGE_KEYS.SCENARIO_PROGRESS;

export interface LocalStorageProgressStoreOptions {
  storageKey?: string;
  storage?: KeyValueStorage;
  logger?: ILogger;
  clock?: IClock;
}

/**
 * Robust localStorage implementation of ScenarioProgressStore (MIN-004, MIN-015).
 * Includes defensive JSON parsing, runtime type narrowing, error boundaries,
 * and an automatic in-memory fallback if localStorage is unavailable.
 */
export class LocalStorageProgressStore implements ScenarioProgressStore {
  private readonly storageKey: string;
  private readonly storage: KeyValueStorage;
  private readonly logger: ILogger;
  private readonly clock: IClock;
  private memoryFallback: Map<string, ScenarioProgress> = new Map();

  constructor(
    optionsOrStorageKey: LocalStorageProgressStoreOptions | string = SCENARIO_PROGRESS_STORAGE_KEY,
    storage: KeyValueStorage = safeLocalStorage,
    logger: ILogger = defaultLogger,
    clock?: IClock
  ) {
    if (typeof optionsOrStorageKey === 'object' && optionsOrStorageKey !== null) {
      this.storageKey = optionsOrStorageKey.storageKey ?? SCENARIO_PROGRESS_STORAGE_KEY;
      this.storage = optionsOrStorageKey.storage ?? safeLocalStorage;
      this.logger = optionsOrStorageKey.logger ?? defaultLogger;
      this.clock = optionsOrStorageKey.clock ?? new SystemClock();
    } else {
      this.storageKey = optionsOrStorageKey;
      this.storage = storage;
      this.logger = logger;
      this.clock = clock ?? new SystemClock();
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

    const now = this.clock.now();
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
    if (!this.storage.isAvailable()) {
      const result: ScenarioProgressMap = {};
      for (const [id, rec] of this.memoryFallback.entries()) {
        result[id] = { ...rec };
      }
      return result;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);
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
    } catch (err) {
      this.logger.warn('Corrupted scenario progress JSON in storage', {
        operation: 'scenario_get_progress_map',
        storageKey: this.storageKey,
        error: err instanceof Error ? err.message : String(err),
      });
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
    const now = this.clock.now();

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

    if (this.storage.isAvailable()) {
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(currentMap));
      } catch (err) {
        if (isQuotaExceededError(err)) {
          storageAlertDispatcher.notify({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'scenarios',
            attemptedAction: 'save',
            timestamp: this.clock.now(),
            message: 'Storage quota exceeded while saving scenario progress.',
            suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
          });
        } else {
          this.logger.warn('Failed to persist scenario progress to storage', {
            operation: 'save_scenario_progress',
            scenarioId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return { ...updated };
  }

  public async restoreProgressMap(map: ScenarioProgressMap): Promise<void> {
    const sanitizedMap: ScenarioProgressMap = {};
    this.memoryFallback.clear();
    for (const [id, rec] of Object.entries(map)) {
      const sanitized = this.sanitizeRecord(rec);
      if (sanitized) {
        sanitizedMap[id] = sanitized;
        this.memoryFallback.set(id, sanitized);
      }
    }

    if (this.storage.isAvailable()) {
      try {
        this.storage.setItem(this.storageKey, JSON.stringify(sanitizedMap));
      } catch (err) {
        if (isQuotaExceededError(err)) {
          storageAlertDispatcher.notify({
            type: 'STORAGE_QUOTA_EXCEEDED',
            store: 'scenarios',
            attemptedAction: 'save',
            timestamp: this.clock.now(),
            message: 'Storage quota exceeded while restoring scenario progress.',
            suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
          });
          throw err;
        }
        this.logger.warn('Failed to persist restored scenario progress to storage', {
          operation: 'restore_scenario_progress_map',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  public async resetAllProgress(): Promise<void> {
    this.memoryFallback.clear();
    if (this.storage.isAvailable()) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch (err) {
        this.logger.warn('Failed to remove scenario progress from storage', {
          operation: 'reset_scenario_progress',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

/**
 * Factory creating a new LocalStorageProgressStore with options object (MIN-004, MIN-015).
 */
export function createLocalStorageProgressStore(
  options: LocalStorageProgressStoreOptions = {}
): LocalStorageProgressStore {
  return new LocalStorageProgressStore(options);
}

/**
 * Backward-compatible factory signature with positional arguments.
 */
export function createDefaultLocalStorageProgressStore(
  storageKey: string = SCENARIO_PROGRESS_STORAGE_KEY,
  storage: KeyValueStorage = safeLocalStorage,
  logger: ILogger = defaultLogger,
  clock?: IClock
): LocalStorageProgressStore {
  return new LocalStorageProgressStore(storageKey, storage, logger, clock);
}

let _defaultStore: LocalStorageProgressStore | null = null;

/**
 * Lazy getter for the singleton default scenario progress store (MIN-015).
 */
export function getDefaultLocalStorageProgressStore(): LocalStorageProgressStore {
  if (!_defaultStore) {
    _defaultStore = createLocalStorageProgressStore();
  }
  return _defaultStore;
}

/**
 * Lazy singleton proxy for default scenario progress store (MIN-015).
 */
export const defaultLocalStorageProgressStore: LocalStorageProgressStore = new Proxy(
  {} as LocalStorageProgressStore,
  {
    get(_target, prop, receiver) {
      const store = getDefaultLocalStorageProgressStore();
      const val = Reflect.get(store, prop, receiver);
      return typeof val === 'function' ? val.bind(store) : val;
    },
  }
);
