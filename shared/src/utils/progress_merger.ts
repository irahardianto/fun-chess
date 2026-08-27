import type {
  ProgressMergeEngine,
  UnifiedProgressPayload,
  SyncMergeStrategy,
  ProgressDiffPreview,
} from "../types/progress_sync.js";
import { UNIFIED_PROGRESS_SCHEMA_VERSION } from "../types/progress_sync.js";
import type { ScenarioProgress, StarRating } from "../contracts/scenario.js";
import type {
  PuzzleTheme,
  ThemeMasteryProgress,
  SolvedPuzzleRecord,
  RatingHistoryPoint,
} from "../contracts/puzzle.js";

/**
 * Calculates theme mastery tier from solve count.
 * - master: >= 20 solved
 * - apprentice: >= 8 solved
 * - novice: < 8 solved
 */
function calculateMasteryLevel(
  solved: number,
): "novice" | "apprentice" | "master" {
  if (solved >= 20) return "master";
  if (solved >= 8) return "apprentice";
  return "novice";
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

  // --- 1. Scenarios Union & Star Upgrades ---
  const mergedScenarios: UnifiedProgressPayload["scenarios"] = {};
  const allScenarioIds = new Set([
    ...Object.keys(local.scenarios || {}),
    ...Object.keys(incoming.scenarios || {}),
  ]);

  for (const id of allScenarioIds) {
    const loc = local.scenarios?.[id];
    const inc = incoming.scenarios?.[id];

    if (loc && !inc) {
      mergedScenarios[id] = structuredClone(loc);
    } else if (!loc && inc) {
      mergedScenarios[id] = structuredClone(inc);
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

      mergedScenarios[id] = {
        scenarioId: id,
        starsEarned,
        attemptsCount: (loc.attemptsCount || 0) + (inc.attemptsCount || 0),
        hintsUsedTotal: (loc.hintsUsedTotal || 0) + (inc.hintsUsedTotal || 0),
        firstCompletedAt,
        lastCompletedAt: Math.max(firstCompletedAt, lastCompletedAt),
      };
    }
  }

  // --- 2. Puzzle Ratings & Glicko Deviation ---
  const locRp = local.puzzles?.ratingProfile;
  const incRp = incoming.puzzles?.ratingProfile;

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

  // --- 3. Theme Mastery Union ---
  const mergedThemes: Record<string, ThemeMasteryProgress> = {};
  const allThemeKeys = new Set([
    ...Object.keys(local.puzzles?.themeMastery || {}),
    ...Object.keys(incoming.puzzles?.themeMastery || {}),
  ]);

  for (const themeKey of allThemeKeys) {
    const locTm = local.puzzles?.themeMastery?.[themeKey];
    const incTm = incoming.puzzles?.themeMastery?.[themeKey];

    if (locTm && !incTm) {
      mergedThemes[themeKey] = structuredClone(locTm);
    } else if (!locTm && incTm) {
      mergedThemes[themeKey] = structuredClone(incTm);
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

      mergedThemes[themeKey] = {
        theme: themeKey as PuzzleTheme,
        attempted,
        solved,
        starsEarned,
        masteryLevel: calculateMasteryLevel(solved),
        lastPracticedAt,
      };
    }
  }

  // --- 4. Arcade High Scores ---
  const locArc = local.puzzles?.arcadeStats;
  const incArc = incoming.puzzles?.arcadeStats;

  const mergedArcade = {
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

  // --- 5. Solved Puzzles Union ---
  const mergedSolvedPuzzles: Record<string, SolvedPuzzleRecord> = {};
  const allPuzzleIds = new Set([
    ...Object.keys(local.puzzles?.solvedPuzzles || {}),
    ...Object.keys(incoming.puzzles?.solvedPuzzles || {}),
  ]);

  for (const puzId of allPuzzleIds) {
    const locPuz = local.puzzles?.solvedPuzzles?.[puzId];
    const incPuz = incoming.puzzles?.solvedPuzzles?.[puzId];

    if (locPuz && !incPuz) {
      mergedSolvedPuzzles[puzId] = structuredClone(locPuz);
    } else if (!locPuz && incPuz) {
      mergedSolvedPuzzles[puzId] = structuredClone(incPuz);
    } else if (locPuz && incPuz) {
      const stars = Math.max(locPuz.stars, incPuz.stars) as StarRating;
      const solvedAt =
        locPuz.solvedAt && incPuz.solvedAt
          ? Math.min(locPuz.solvedAt, incPuz.solvedAt)
          : locPuz.solvedAt || incPuz.solvedAt || 0;
      mergedSolvedPuzzles[puzId] = {
        stars,
        solvedAt,
      };
    }
  }

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
      ratingProfile: {
        rating: mergedRating,
        ratingDeviation: mergedRd,
        peakRating: mergedPeak,
        totalAttempted: mergedAttempted,
        totalSolved: mergedSolved,
        bestStreak: mergedStreak,
        ratingHistory: mergedHistory,
      },
      themeMastery: mergedThemes,
      arcadeStats: mergedArcade,
      solvedPuzzles: mergedSolvedPuzzles,
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
    JSON.stringify(local.scenarios) !== JSON.stringify(incoming.scenarios) ||
    JSON.stringify(local.puzzles.solvedPuzzles) !==
      JSON.stringify(incoming.puzzles.solvedPuzzles);

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
