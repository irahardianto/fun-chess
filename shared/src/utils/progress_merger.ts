import type {
  ProgressMergeEngine,
  UnifiedProgressPayload,
  SyncMergeStrategy,
  ProgressDiffPreview,
} from "../types/progress_sync.js";
import { UNIFIED_PROGRESS_SCHEMA_VERSION } from "../types/progress_sync.js";
import type { ScenarioProgressMap, StarRating } from "../contracts/scenario.js";
import type {
  PuzzleTheme,
  ThemeMasteryProgress,
  SolvedPuzzleRecord,
  RatingHistoryPoint,
  AdaptiveRatingState,
  PuzzleArcadeStats,
} from "../contracts/puzzle.js";

/**
 * Calculates theme mastery tier from solve count.
 * - master: >= 20 solved
 * - apprentice: >= 8 solved
 * - novice: < 8 solved
 *
 * @param solved - Total puzzles solved in this theme
 * @returns Calculated mastery tier
 */
function calculateMasteryLevel(
  solved: number,
): "novice" | "apprentice" | "master" {
  if (solved >= 20) return "master";
  if (solved >= 8) return "apprentice";
  return "novice";
}

/**
 * Merges scenario progress maps using smart star upgrade and timestamp merging.
 *
 * @param localScenarios - Local scenarios progress map
 * @param incomingScenarios - Incoming scenarios progress map
 * @returns Combined ScenarioProgressMap
 */
export function mergeScenarios(
  localScenarios?: ScenarioProgressMap | null,
  incomingScenarios?: ScenarioProgressMap | null,
): ScenarioProgressMap {
  const merged: ScenarioProgressMap = {};
  const local = localScenarios || {};
  const incoming = incomingScenarios || {};
  const allScenarioIds = new Set([
    ...Object.keys(local),
    ...Object.keys(incoming),
  ]);

  for (const id of allScenarioIds) {
    const loc = local[id];
    const inc = incoming[id];

    if (loc && !inc) {
      merged[id] = structuredClone(loc);
    } else if (!loc && inc) {
      merged[id] = structuredClone(inc);
    } else if (loc && inc) {
      const starsEarned = Math.max(
        loc.starsEarned,
        inc.starsEarned,
      ) as StarRating;
      const firstCompletedAt =
        loc.firstCompletedAt && inc.firstCompletedAt
          ? Math.min(loc.firstCompletedAt, inc.firstCompletedAt)
          : loc.firstCompletedAt || inc.firstCompletedAt || 0;
      const lastCompletedAt = Math.max(
        loc.lastCompletedAt || 0,
        inc.lastCompletedAt || 0,
      );

      merged[id] = {
        scenarioId: id,
        starsEarned,
        attemptsCount: (loc.attemptsCount || 0) + (inc.attemptsCount || 0),
        hintsUsedTotal: (loc.hintsUsedTotal || 0) + (inc.hintsUsedTotal || 0),
        firstCompletedAt,
        lastCompletedAt: Math.max(firstCompletedAt, lastCompletedAt),
      };
    }
  }

  return merged;
}

/**
 * Merges Glicko/Elo adaptive rating profiles favoring higher certainty (lower RD) and peak ratings.
 *
 * @param locRp - Local rating profile
 * @param incRp - Incoming rating profile
 * @returns Combined AdaptiveRatingState
 */
export function mergeRatingProfile(
  locRp?: AdaptiveRatingState | null,
  incRp?: AdaptiveRatingState | null,
): AdaptiveRatingState {
  const locRating = locRp?.rating ?? 800;
  const incRating = incRp?.rating ?? 800;
  const mergedRating = Math.max(locRating, incRating);

  const locPeak = locRp?.peakRating ?? locRating;
  const incPeak = incRp?.peakRating ?? incRating;
  const mergedPeak = Math.max(locPeak, incPeak, mergedRating);

  const locRd = locRp?.ratingDeviation ?? 350;
  const incRd = incRp?.ratingDeviation ?? 350;
  const mergedRd = Math.min(locRd, incRd); // Lower RD favors higher certainty / confidence

  const mergedAttempted =
    (locRp?.totalAttempted ?? 0) + (incRp?.totalAttempted ?? 0);
  const mergedSolved = (locRp?.totalSolved ?? 0) + (incRp?.totalSolved ?? 0);
  const mergedStreak = Math.max(locRp?.bestStreak ?? 0, incRp?.bestStreak ?? 0);

  // Combine and sort rating history points
  const rawHistory: RatingHistoryPoint[] = [
    ...(locRp?.ratingHistory || []),
    ...(incRp?.ratingHistory || []),
  ];
  const mergedHistoryMap = new Map<string, RatingHistoryPoint>();
  for (const pt of rawHistory) {
    const key = `${pt.timestamp}_${pt.puzzleId}`;
    if (!mergedHistoryMap.has(key)) {
      mergedHistoryMap.set(key, pt);
    }
  }
  const mergedHistory = Array.from(mergedHistoryMap.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-50);

  return {
    rating: mergedRating,
    ratingDeviation: mergedRd,
    peakRating: mergedPeak,
    totalAttempted: mergedAttempted,
    totalSolved: mergedSolved,
    bestStreak: mergedStreak,
    ratingHistory: mergedHistory,
  };
}

/**
 * Merges tactical theme mastery records and recalculates mastery tier.
 *
 * @param localThemes - Local theme mastery map
 * @param incomingThemes - Incoming theme mastery map
 * @returns Combined theme mastery map
 */
export function mergeThemeMastery(
  localThemes?: Record<string, ThemeMasteryProgress> | null,
  incomingThemes?: Record<string, ThemeMasteryProgress> | null,
): Record<string, ThemeMasteryProgress> {
  const merged: Record<string, ThemeMasteryProgress> = {};
  const local = localThemes || {};
  const incoming = incomingThemes || {};
  const allThemeKeys = new Set([
    ...Object.keys(local),
    ...Object.keys(incoming),
  ]);

  for (const themeKey of allThemeKeys) {
    const locTm = local[themeKey];
    const incTm = incoming[themeKey];

    if (locTm && !incTm) {
      merged[themeKey] = structuredClone(locTm);
    } else if (!locTm && incTm) {
      merged[themeKey] = structuredClone(incTm);
    } else if (locTm && incTm) {
      const solved = (locTm.solved || 0) + (incTm.solved || 0);
      const attempted = Math.max(
        solved,
        (locTm.attempted || 0) + (incTm.attempted || 0),
      );
      const starsEarned = (locTm.starsEarned || 0) + (incTm.starsEarned || 0);
      const lastPracticedAt = Math.max(
        locTm.lastPracticedAt || 0,
        incTm.lastPracticedAt || 0,
      );

      merged[themeKey] = {
        theme: themeKey as PuzzleTheme,
        attempted,
        solved,
        starsEarned,
        masteryLevel: calculateMasteryLevel(solved),
        lastPracticedAt,
      };
    }
  }

  return merged;
}

/**
 * Merges arcade mode high scores and runs.
 *
 * @param locArc - Local arcade stats
 * @param incArc - Incoming arcade stats
 * @returns Combined PuzzleArcadeStats
 */
export function mergeArcadeStats(
  locArc?: PuzzleArcadeStats | null,
  incArc?: PuzzleArcadeStats | null,
): PuzzleArcadeStats {
  return {
    puzzleRushHighScore: Math.max(
      locArc?.puzzleRushHighScore ?? 0,
      incArc?.puzzleRushHighScore ?? 0,
    ),
    puzzleRushBestStreak: Math.max(
      locArc?.puzzleRushBestStreak ?? 0,
      incArc?.puzzleRushBestStreak ?? 0,
    ),
    streakSurvivorHighScore: Math.max(
      locArc?.streakSurvivorHighScore ?? 0,
      incArc?.streakSurvivorHighScore ?? 0,
    ),
    totalRushRuns: (locArc?.totalRushRuns ?? 0) + (incArc?.totalRushRuns ?? 0),
  };
}

/**
 * Merges solved puzzle history keeping highest stars and earliest completion timestamps.
 *
 * @param localSolved - Local solved puzzles map
 * @param incomingSolved - Incoming solved puzzles map
 * @returns Combined solved puzzles map
 */
export function mergeSolvedPuzzles(
  localSolved?: Record<string, SolvedPuzzleRecord> | null,
  incomingSolved?: Record<string, SolvedPuzzleRecord> | null,
): Record<string, SolvedPuzzleRecord> {
  const merged: Record<string, SolvedPuzzleRecord> = {};
  const local = localSolved || {};
  const incoming = incomingSolved || {};
  const allPuzzleIds = new Set([
    ...Object.keys(local),
    ...Object.keys(incoming),
  ]);

  for (const puzId of allPuzzleIds) {
    const locPuz = local[puzId];
    const incPuz = incoming[puzId];

    if (locPuz && !incPuz) {
      merged[puzId] = structuredClone(locPuz);
    } else if (!locPuz && incPuz) {
      merged[puzId] = structuredClone(incPuz);
    } else if (locPuz && incPuz) {
      const stars = Math.max(locPuz.stars, incPuz.stars) as StarRating;
      const solvedAt =
        locPuz.solvedAt && incPuz.solvedAt
          ? Math.min(locPuz.solvedAt, incPuz.solvedAt)
          : locPuz.solvedAt || incPuz.solvedAt || 0;
      merged[puzId] = {
        stars,
        solvedAt,
      };
    }
  }

  return merged;
}

/**
 * Pure function performing deterministic smart merge of user progress.
 * Adheres to Rule 2 (Zero side effects, zero I/O).
 *
 * @param local - Current local progress state
 * @param incoming - Incoming progress package
 * @param strategy - Resolution strategy ('smart_merge' | 'replace_local' | 'keep_local')
 * @returns Combined UnifiedProgressPayload
 */
export function mergeUnifiedProgress(
  local: UnifiedProgressPayload,
  incoming: UnifiedProgressPayload,
  strategy: SyncMergeStrategy,
): UnifiedProgressPayload {
  if (strategy === "keep_local") {
    return structuredClone(local);
  }
  if (strategy === "replace_local") {
    return structuredClone(incoming);
  }

  // Decomposed sub-domain merges (MIN-006)
  const mergedScenarios = mergeScenarios(local.scenarios, incoming.scenarios);
  const ratingProfile = mergeRatingProfile(
    local.puzzles?.ratingProfile,
    incoming.puzzles?.ratingProfile,
  );
  const themeMastery = mergeThemeMastery(
    local.puzzles?.themeMastery,
    incoming.puzzles?.themeMastery,
  );
  const arcadeStats = mergeArcadeStats(
    local.puzzles?.arcadeStats,
    incoming.puzzles?.arcadeStats,
  );
  const solvedPuzzles = mergeSolvedPuzzles(
    local.puzzles?.solvedPuzzles,
    incoming.puzzles?.solvedPuzzles,
  );

  const createdAt =
    local.puzzles?.createdAt && incoming.puzzles?.createdAt
      ? Math.min(local.puzzles.createdAt, incoming.puzzles.createdAt)
      : local.puzzles?.createdAt || incoming.puzzles?.createdAt || Date.now();

  const lastActiveAt = Math.max(
    local.puzzles?.lastActiveAt || 0,
    incoming.puzzles?.lastActiveAt || 0,
    Date.now(),
  );

  return {
    version: UNIFIED_PROGRESS_SCHEMA_VERSION,
    exportedAt: Date.now(),
    clientVersion: incoming.clientVersion || local.clientVersion,
    scenarios: mergedScenarios,
    puzzles: {
      ratingProfile,
      themeMastery,
      arcadeStats,
      solvedPuzzles,
      createdAt,
      lastActiveAt,
    },
  };
}

/**
 * Calculates itemized statistical differences between local and incoming progress.
 * Consumed by UI components for conflict resolution previews.
 *
 * @param local - Current local progress state
 * @param incoming - Incoming progress package
 * @returns ProgressDiffPreview summary
 */
export function calculateProgressDiff(
  local: UnifiedProgressPayload,
  incoming: UnifiedProgressPayload,
): ProgressDiffPreview {
  const localScenarios = local.scenarios || {};
  const incomingScenarios = incoming.scenarios || {};

  const localScIds = Object.keys(localScenarios);
  const incomingScIds = Object.keys(incomingScenarios);
  const unionScIds = new Set([...localScIds, ...incomingScIds]);

  const newCompletedScenarios = incomingScIds.filter(
    (id) => !(id in localScenarios),
  );
  const starUpgrades: {
    scenarioId: string;
    fromStars: StarRating;
    toStars: StarRating;
  }[] = [];

  let localTotalStars = 0;
  for (const sc of Object.values(localScenarios)) {
    localTotalStars += sc.starsEarned;
  }

  let incomingTotalStars = 0;
  for (const sc of Object.values(incomingScenarios)) {
    incomingTotalStars += sc.starsEarned;
  }

  let mergedTotalStars = 0;
  for (const id of unionScIds) {
    const locStars = localScenarios[id]?.starsEarned ?? 0;
    const incStars = incomingScenarios[id]?.starsEarned ?? 0;
    const maxStars = Math.max(locStars, incStars) as StarRating;
    mergedTotalStars += maxStars;

    if (locStars > 0 && incStars > locStars) {
      starUpgrades.push({
        scenarioId: id,
        fromStars: locStars as StarRating,
        toStars: incStars as StarRating,
      });
    }
  }

  // Puzzles diff
  const localPuz = local.puzzles?.solvedPuzzles || {};
  const incomingPuz = incoming.puzzles?.solvedPuzzles || {};
  const localPuzIds = Object.keys(localPuz);
  const incomingPuzIds = Object.keys(incomingPuz);
  const unionPuzIds = new Set([...localPuzIds, ...incomingPuzIds]);
  const newPuzzlesSolved = incomingPuzIds.filter((id) => !(id in localPuz));

  const locRp = local.puzzles?.ratingProfile;
  const incRp = incoming.puzzles?.ratingProfile;

  const localRating = locRp?.rating ?? 800;
  const incomingRating = incRp?.rating ?? 800;
  const mergedRating = Math.max(localRating, incomingRating);

  const localPeakRating = locRp?.peakRating ?? localRating;
  const incomingPeakRating = incRp?.peakRating ?? incomingRating;
  const mergedPeakRating = Math.max(
    localPeakRating,
    incomingPeakRating,
    mergedRating,
  );

  // Arcade diff
  const locArc = local.puzzles?.arcadeStats;
  const incArc = incoming.puzzles?.arcadeStats;

  const localRushHighScore = locArc?.puzzleRushHighScore ?? 0;
  const incomingRushHighScore = incArc?.puzzleRushHighScore ?? 0;
  const mergedRushHighScore = Math.max(
    localRushHighScore,
    incomingRushHighScore,
  );

  const localSurvivorHighScore = locArc?.streakSurvivorHighScore ?? 0;
  const incomingSurvivorHighScore = incArc?.streakSurvivorHighScore ?? 0;
  const mergedSurvivorHighScore = Math.max(
    localSurvivorHighScore,
    incomingSurvivorHighScore,
  );

  // Metadata
  const localLastActiveAt = local.puzzles?.lastActiveAt || 0;
  const incomingLastActiveAt = incoming.puzzles?.lastActiveAt || 0;
  const incomingExportedAt = incoming.exportedAt || 0;
  const isIncomingNewer =
    incomingExportedAt > (local.exportedAt || 0) ||
    incomingLastActiveAt > localLastActiveAt;

  // Upgrades detection
  const hasUpgrades =
    incomingRating > localRating ||
    incomingPeakRating > localPeakRating ||
    incomingRushHighScore > localRushHighScore ||
    incomingSurvivorHighScore > localSurvivorHighScore ||
    newCompletedScenarios.length > 0 ||
    starUpgrades.length > 0 ||
    newPuzzlesSolved.length > 0;

  // Differences detection
  const hasDifferences =
    hasUpgrades ||
    localScIds.length !== incomingScIds.length ||
    localPuzIds.length !== incomingPuzIds.length ||
    localRating !== incomingRating ||
    localPeakRating !== incomingPeakRating ||
    localRushHighScore !== incomingRushHighScore ||
    localSurvivorHighScore !== incomingSurvivorHighScore ||
    JSON.stringify(local.scenarios ?? {}) !==
      JSON.stringify(incoming.scenarios ?? {}) ||
    JSON.stringify(local.puzzles?.solvedPuzzles ?? {}) !==
      JSON.stringify(incoming.puzzles?.solvedPuzzles ?? {});

  return {
    academy: {
      localCompletedCount: localScIds.length,
      incomingCompletedCount: incomingScIds.length,
      mergedCompletedCount: unionScIds.size,
      localTotalStars,
      incomingTotalStars,
      mergedTotalStars,
      newCompletedScenarios,
      starUpgrades,
    },
    puzzles: {
      localSolvedCount: localPuzIds.length,
      incomingSolvedCount: incomingPuzIds.length,
      mergedSolvedCount: unionPuzIds.size,
      localRating,
      incomingRating,
      mergedRating,
      localPeakRating,
      incomingPeakRating,
      mergedPeakRating,
      newPuzzlesSolvedCount: newPuzzlesSolved.length,
    },
    arcade: {
      localRushHighScore,
      incomingRushHighScore,
      mergedRushHighScore,
      localSurvivorHighScore,
      incomingSurvivorHighScore,
      mergedSurvivorHighScore,
    },
    metadata: {
      localLastActiveAt,
      incomingLastActiveAt,
      incomingExportedAt,
      isIncomingNewer,
    },
    hasDifferences,
    hasUpgrades,
  };
}

/**
 * Semantic alias for calculateProgressDiff to support alternative naming conventions.
 */
export const createProgressDiffPreview = calculateProgressDiff;

/**
 * Default implementation of ProgressMergeEngine interface.
 */
export class DefaultProgressMergeEngine implements ProgressMergeEngine {
  public merge(
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload,
    strategy: SyncMergeStrategy,
  ): UnifiedProgressPayload {
    return mergeUnifiedProgress(local, incoming, strategy);
  }

  public calculateDiff(
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload,
  ): ProgressDiffPreview {
    return calculateProgressDiff(local, incoming);
  }
}

/**
 * Singleton instance of DefaultProgressMergeEngine.
 */
export const defaultProgressMergeEngine = new DefaultProgressMergeEngine();
export const progressMergeEngine = defaultProgressMergeEngine;
