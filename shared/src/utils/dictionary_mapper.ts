import type {
  DictionaryMapper,
  UnifiedProgressPayload,
  CompactProgressDto,
  CompactScenarioTuple,
  CompactRatingProfileTuple,
  CompactThemeMasteryTuple,
  CompactSolvedPuzzleTuple,
  CompactArcadeStatsTuple,
} from "../types/progress_sync.js";
import type {
  ScenarioProgress,
  ScenarioProgressMap,
  StarRating,
} from "../contracts/scenario.js";
import {
  type PuzzleProgress,
  type PuzzleTheme,
  type ThemeMasteryProgress,
  type SolvedPuzzleRecord,
  type AdaptiveRatingState,
  type PuzzleArcadeStats,
  calculateMasteryLevel,
} from "../contracts/puzzle.js";

/**
 * Forbidden prototype keys to prevent prototype pollution attacks (MAJ-006).
 */
export const FORBIDDEN_PROTOTYPE_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Default implementation of DictionaryMapper for bidirectional transformation between
 * domain UnifiedProgressPayload and compact tokenized CompactProgressDto.
 */
export class DefaultDictionaryMapper implements DictionaryMapper {
  /**
   * Compresses full domain UnifiedProgressPayload into compact tuple DTO.
   * Converts millisecond timestamps to second granularity to minimize JSON byte length.
   *
   * @param payload - Full domain progress payload
   * @returns Minified compact progress transfer object
   */
  /**
   * Maps scenario progress dictionary to compact scenario tuples sorted by scenario ID.
   *
   * @param scenarios - Scenario progress records
   * @param fallbackMs - Reference timestamp in milliseconds for completion dates
   * @returns List of compact scenario tuples
   */
  private mapScenariosToCompact(
    scenarios: ScenarioProgressMap | undefined,
    fallbackMs: number,
  ): CompactScenarioTuple[] {
    const scenarioEntries = Object.entries(scenarios || {}).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return scenarioEntries.map(([id, sc]) => [
      id,
      sc.starsEarned === 3 ? 3 : sc.starsEarned === 2 ? 2 : 1,
      Math.max(0, Math.floor(sc.attemptsCount || 0)),
      Math.max(0, Math.floor(sc.hintsUsedTotal || 0)),
      Math.floor((sc.firstCompletedAt || fallbackMs) / 1000),
      Math.floor((sc.lastCompletedAt || fallbackMs) / 1000),
    ]);
  }

  /**
   * Maps adaptive rating state to compact rating profile tuple.
   *
   * @param rp - Adaptive rating state
   * @returns Compact rating profile tuple
   */
  private mapRatingToCompact(
    rp: AdaptiveRatingState | undefined,
  ): CompactRatingProfileTuple {
    return [
      Math.round(rp?.rating ?? 800),
      Math.round(rp?.ratingDeviation ?? 350),
      Math.round(rp?.peakRating ?? rp?.rating ?? 800),
      Math.max(0, Math.floor(rp?.totalAttempted ?? 0)),
      Math.max(0, Math.floor(rp?.totalSolved ?? 0)),
      Math.max(0, Math.floor(rp?.bestStreak ?? 0)),
    ];
  }

  /**
   * Maps theme mastery dictionary to compact theme mastery tuples sorted by theme key.
   *
   * @param tm - Theme mastery progress dictionary
   * @param fallbackMs - Reference timestamp in milliseconds
   * @returns List of compact theme mastery tuples
   */
  private mapThemeMasteryToCompact(
    tm: Record<string, ThemeMasteryProgress> | undefined,
    fallbackMs: number,
  ): CompactThemeMasteryTuple[] {
    const themeEntries = Object.entries(tm || {}).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return themeEntries.map(([theme, progress]) => [
      theme,
      Math.max(0, Math.floor(progress.attempted || 0)),
      Math.max(0, Math.floor(progress.solved || 0)),
      Math.max(0, Math.floor(progress.starsEarned || 0)),
      Math.floor((progress.lastPracticedAt || fallbackMs) / 1000),
    ]);
  }

  /**
   * Maps puzzle arcade statistics to compact arcade stats tuple.
   *
   * @param ac - Puzzle arcade stats
   * @returns Compact arcade stats tuple
   */
  private mapArcadeStatsToCompact(
    ac: PuzzleArcadeStats | undefined,
  ): CompactArcadeStatsTuple {
    return [
      Math.max(0, Math.floor(ac?.puzzleRushHighScore ?? 0)),
      Math.max(0, Math.floor(ac?.puzzleRushBestStreak ?? 0)),
      Math.max(0, Math.floor(ac?.streakSurvivorHighScore ?? 0)),
      Math.max(0, Math.floor(ac?.totalRushRuns ?? 0)),
    ];
  }

  /**
   * Maps solved puzzle records to compact solved puzzle tuples sorted by puzzle ID.
   *
   * @param sp - Solved puzzle records dictionary
   * @param fallbackMs - Reference timestamp in milliseconds
   * @returns List of compact solved puzzle tuples
   */
  private mapSolvedPuzzlesToCompact(
    sp: Record<string, SolvedPuzzleRecord> | undefined,
    fallbackMs: number,
  ): CompactSolvedPuzzleTuple[] {
    const solvedEntries = Object.entries(sp || {}).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return solvedEntries.map(([id, record]) => [
      id,
      record.stars === 3 ? 3 : record.stars === 2 ? 2 : 1,
      Math.floor((record.solvedAt || fallbackMs) / 1000),
    ]);
  }

  /**
   * Compresses full domain UnifiedProgressPayload into compact tuple DTO.
   * Converts millisecond timestamps to second granularity to minimize JSON byte length.
   * Pure and deterministic: does not call Date.now() (MAJ-019).
   *
   * @param payload - Full domain progress payload
   * @param now - Optional reference epoch millisecond timestamp (defaults to payload.exportedAt ?? 0)
   * @returns Minified compact progress transfer object
   */
  public toCompact(
    payload: UnifiedProgressPayload,
    now?: number,
  ): CompactProgressDto {
    const referenceNow = now !== undefined ? now : (payload.exportedAt ?? 0);
    const fallbackMs = payload.exportedAt || referenceNow;
    const exportedSec = Math.floor(fallbackMs / 1000);

    const compactScenarios = this.mapScenariosToCompact(
      payload.scenarios,
      fallbackMs,
    );
    const compactRating = this.mapRatingToCompact(
      payload.puzzles?.ratingProfile,
    );
    const compactThemes = this.mapThemeMasteryToCompact(
      payload.puzzles?.themeMastery,
      fallbackMs,
    );
    const compactArcade = this.mapArcadeStatsToCompact(
      payload.puzzles?.arcadeStats,
    );
    const compactSolved = this.mapSolvedPuzzlesToCompact(
      payload.puzzles?.solvedPuzzles,
      fallbackMs,
    );

    const createdSec = Math.floor(
      (payload.puzzles?.createdAt || fallbackMs) / 1000,
    );
    const lastActiveSec = Math.floor(
      (payload.puzzles?.lastActiveAt || fallbackMs) / 1000,
    );

    const dto: CompactProgressDto = {
      v: payload.version || 1,
      t: exportedSec,
      sc: compactScenarios,
      pz: {
        r: compactRating,
        tm: compactThemes,
        ac: compactArcade,
        sp: compactSolved,
        ca: createdSec,
        la: lastActiveSec,
      },
    };

    if (payload.clientVersion) {
      return {
        ...dto,
        c: payload.clientVersion,
      };
    }

    return dto;
  }

  /**
   * Restores scenario progress map from compact scenario tuples.
   */
  private restoreScenarios(
    compactScenarios: readonly CompactScenarioTuple[] | undefined,
  ): ScenarioProgressMap {
    const scenarios: ScenarioProgressMap = Object.create(null);
    if (!Array.isArray(compactScenarios)) {
      return scenarios;
    }
    for (const tuple of compactScenarios) {
      if (!Array.isArray(tuple) || tuple.length < 6) continue;
      const [id, stars, attempts, hints, firstSec, lastSec] = tuple;
      if (!id || typeof id !== "string") continue;

      const cleanId = id.trim();
      if (FORBIDDEN_PROTOTYPE_KEYS.has(cleanId)) {
        continue;
      }

      const starsEarned: StarRating = stars === 3 ? 3 : stars === 2 ? 2 : 1;
      const firstCompletedAt = Math.max(0, Math.floor((firstSec ?? 0) * 1000));
      const lastCompletedAt = Math.max(0, Math.floor((lastSec ?? 0) * 1000));

      const scRecord: ScenarioProgress = {
        scenarioId: cleanId,
        starsEarned,
        attemptsCount: Math.max(0, Math.floor(attempts ?? 0)),
        hintsUsedTotal: Math.max(0, Math.floor(hints ?? 0)),
        firstCompletedAt,
        lastCompletedAt: Math.max(firstCompletedAt, lastCompletedAt),
      };
      scenarios[cleanId] = scRecord;
    }
    return scenarios;
  }

  /**
   * Restores adaptive rating state from compact rating profile tuple.
   */
  private restoreRatingProfile(
    rTuple: CompactRatingProfileTuple | undefined,
  ): AdaptiveRatingState {
    const tuple = rTuple ?? [800, 350, 800, 0, 0, 0];
    const rating = Math.min(3000, Math.max(500, Math.round(tuple[0] ?? 800)));
    const ratingDeviation = Math.min(
      500,
      Math.max(50, Math.round(tuple[1] ?? 350)),
    );
    const peakRating = Math.min(
      3000,
      Math.max(500, Math.round(tuple[2] ?? rating)),
    );
    const totalAttempted = Math.max(0, Math.floor(tuple[3] ?? 0));
    const totalSolved = Math.max(
      0,
      Math.min(totalAttempted, Math.floor(tuple[4] ?? 0)),
    );
    const bestStreak = Math.max(0, Math.floor(tuple[5] ?? 0));

    return {
      rating,
      ratingDeviation,
      peakRating: Math.max(rating, peakRating),
      totalAttempted,
      totalSolved,
      bestStreak,
      ratingHistory: [],
    };
  }

  /**
   * Restores theme mastery dictionary from compact theme mastery tuples.
   */
  private restoreThemeMastery(
    tmTuples: readonly CompactThemeMasteryTuple[] | undefined,
  ): Record<string, ThemeMasteryProgress> {
    const themeMastery: Record<string, ThemeMasteryProgress> = Object.create(null);
    if (!Array.isArray(tmTuples)) {
      return themeMastery;
    }
    for (const tuple of tmTuples) {
      if (!Array.isArray(tuple) || tuple.length < 5) continue;
      const [themeKey, attempted, solved, starsEarned, lastPracticedSec] =
        tuple;
      if (!themeKey || typeof themeKey !== "string") continue;

      const cleanTheme = themeKey.trim();
      if (FORBIDDEN_PROTOTYPE_KEYS.has(cleanTheme)) {
        continue;
      }

      const safeAttempted = Math.max(0, Math.floor(attempted ?? 0));
      const safeSolved = Math.max(
        0,
        Math.min(safeAttempted, Math.floor(solved ?? 0)),
      );
      const safeStars = Math.max(0, Math.floor(starsEarned ?? 0));
      const lastPracticedAt = Math.max(
        0,
        Math.floor((lastPracticedSec ?? 0) * 1000),
      );

      themeMastery[cleanTheme] = {
        theme: cleanTheme as PuzzleTheme,
        attempted: safeAttempted,
        solved: safeSolved,
        starsEarned: safeStars,
        masteryLevel: calculateMasteryLevel(safeSolved),
        lastPracticedAt,
      };
    }
    return themeMastery;
  }

  /**
   * Restores puzzle arcade statistics from compact arcade stats tuple.
   */
  private restoreArcadeStats(
    acTuple: CompactArcadeStatsTuple | undefined,
  ): PuzzleArcadeStats {
    const tuple = acTuple ?? [0, 0, 0, 0];
    return {
      puzzleRushHighScore: Math.max(0, Math.floor(tuple[0] ?? 0)),
      puzzleRushBestStreak: Math.max(0, Math.floor(tuple[1] ?? 0)),
      streakSurvivorHighScore: Math.max(0, Math.floor(tuple[2] ?? 0)),
      totalRushRuns: Math.max(0, Math.floor(tuple[3] ?? 0)),
    };
  }

  /**
   * Restores solved puzzle records from compact solved puzzle tuples.
   */
  private restoreSolvedPuzzles(
    spTuples: readonly CompactSolvedPuzzleTuple[] | undefined,
  ): Record<string, SolvedPuzzleRecord> {
    const solvedPuzzles: Record<string, SolvedPuzzleRecord> = Object.create(null);
    if (!Array.isArray(spTuples)) {
      return solvedPuzzles;
    }
    for (const tuple of spTuples) {
      if (!Array.isArray(tuple) || tuple.length < 3) continue;
      const [puzId, stars, solvedSec] = tuple;
      if (!puzId || typeof puzId !== "string") continue;

      const cleanPuzId = puzId.trim();
      if (FORBIDDEN_PROTOTYPE_KEYS.has(cleanPuzId)) {
        continue;
      }

      const starRating: StarRating = stars === 3 ? 3 : stars === 2 ? 2 : 1;
      solvedPuzzles[cleanPuzId] = {
        stars: starRating,
        solvedAt: Math.max(0, Math.floor((solvedSec ?? 0) * 1000)),
      };
    }
    return solvedPuzzles;
  }

  /**
   * Expands compact tokenized CompactProgressDto into full domain UnifiedProgressPayload.
   * Multiplies second timestamps back to millisecond scale and restores model structures.
   *
   * Pure and deterministic: does not call Date.now() (MAJ-019).
   *
   * @param compact - Minified compact progress transfer object
   * @param now - Optional reference epoch millisecond timestamp (defaults to compact.t * 1000 ?? 0)
   * @returns Restored full domain progress payload
   */
  public fromCompact(
    compact: CompactProgressDto,
    now?: number,
  ): UnifiedProgressPayload {
    const referenceNowSec =
      now !== undefined ? Math.floor(now / 1000) : (compact.t ?? 0);
    const version = compact.v || 1;
    const exportedAt = (compact.t || referenceNowSec) * 1000;
    const clientVersion = compact.c;

    const scenarios = this.restoreScenarios(compact.sc);
    const ratingProfile = this.restoreRatingProfile(compact.pz?.r);
    const themeMastery = this.restoreThemeMastery(compact.pz?.tm);
    const arcadeStats = this.restoreArcadeStats(compact.pz?.ac);
    const solvedPuzzles = this.restoreSolvedPuzzles(compact.pz?.sp);

    const createdAt =
      (compact.pz?.ca ?? compact.t ?? referenceNowSec) * 1000;
    const lastActiveAt =
      (compact.pz?.la ?? compact.t ?? referenceNowSec) * 1000;

    const puzzles: PuzzleProgress = {
      ratingProfile,
      themeMastery,
      arcadeStats,
      solvedPuzzles,
      createdAt,
      lastActiveAt,
    };

    return {
      version,
      exportedAt,
      ...(clientVersion ? { clientVersion } : {}),
      scenarios,
      puzzles,
    };
  }
}

/**
 * Singleton instance of DefaultDictionaryMapper.
 */
export const defaultDictionaryMapper = new DefaultDictionaryMapper();

/**
 * Convenience helper to compress domain payload into compact DTO.
 */
export function toCompactProgress(
  payload: UnifiedProgressPayload,
  now?: number,
): CompactProgressDto {
  return defaultDictionaryMapper.toCompact(payload, now);
}

/**
 * Convenience helper to expand compact DTO into domain payload.
 */
export function fromCompactProgress(
  compact: CompactProgressDto,
  now?: number,
): UnifiedProgressPayload {
  return defaultDictionaryMapper.fromCompact(compact, now);
}
