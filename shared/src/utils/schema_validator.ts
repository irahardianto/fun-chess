import type {
  SchemaValidator,
  ValidationResult,
  UnifiedProgressPayload,
} from "../types/progress_sync.js";
import { UNIFIED_PROGRESS_SCHEMA_VERSION } from "../types/progress_sync.js";
import type {
  ScenarioProgress,
  ScenarioProgressMap,
  StarRating,
} from "../contracts/scenario.js";
import type {
  PuzzleProgress,
  PuzzleTheme,
  ThemeMasteryProgress,
  SolvedPuzzleRecord,
  RatingHistoryPoint,
} from "../contracts/puzzle.js";

/**
 * Strips non-printable and ASCII control characters from strings.
 */
function sanitizeString(str: unknown): string {
  if (typeof str !== "string") return "";
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
}

/**
 * Clamps numeric timestamps to [0, Date.now() + 86400000].
 */
function clampTimestamp(val: unknown, fallback?: number): number {
  const maxTimestamp = Date.now() + 86400000; // 24 hours buffer for clock skew
  if (val === undefined || val === null) {
    return fallback !== undefined ? fallback : 0;
  }
  const num = typeof val === "number" && !Number.isNaN(val) ? val : Number(val);
  if (Number.isNaN(num)) {
    return fallback !== undefined ? fallback : 0;
  }
  return Math.min(maxTimestamp, Math.max(0, Math.floor(num)));
}

/**
 * Clamps star rating to 1, 2, or 3.
 */
function clampStarRating(val: unknown): StarRating {
  const num = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(num)) return 1;
  if (num >= 3) return 3;
  if (num >= 2) return 2;
  return 1;
}

/**
 * Recalculates theme mastery level.
 */
function calculateMasteryLevel(
  solved: number,
): "novice" | "apprentice" | "master" {
  if (solved >= 20) return "master";
  if (solved >= 8) return "apprentice";
  return "novice";
}

/**
 * Default implementation of SchemaValidator enforcing Rugged Software principles
 * with robust defensive clamping and boundary validation.
 */
export class DefaultSchemaValidator implements SchemaValidator {
  /**
   * Validates and defensively sanitizes unknown input into a valid UnifiedProgressPayload.
   *
   * @param raw - Unknown input value
   * @returns ValidationResult with sanitized data or descriptive errors
   */
  public sanitizeAndValidate(
    raw: unknown,
  ): ValidationResult<UnifiedProgressPayload> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        success: false,
        errors: [
          "Invalid progress payload: root value must be a non-null object",
        ],
      };
    }

    const obj = raw as Record<string, unknown>;

    // Version
    const version =
      typeof obj["version"] === "number" && obj["version"] > 0
        ? Math.floor(obj["version"])
        : UNIFIED_PROGRESS_SCHEMA_VERSION;

    // Exported timestamp
    const now = Date.now();
    const exportedAt = clampTimestamp(obj["exportedAt"], now);

    // Client version
    const clientVersion =
      typeof obj["clientVersion"] === "string"
        ? sanitizeString(obj["clientVersion"])
        : undefined;

    // Sanitize Scenarios
    const scenarios: ScenarioProgressMap = {};
    const rawScenarios = obj["scenarios"];
    if (
      rawScenarios &&
      typeof rawScenarios === "object" &&
      !Array.isArray(rawScenarios)
    ) {
      for (const [key, rawSc] of Object.entries(
        rawScenarios as Record<string, unknown>,
      )) {
        if (!rawSc || typeof rawSc !== "object" || Array.isArray(rawSc))
          continue;
        const scObj = rawSc as Record<string, unknown>;
        const scenarioId = sanitizeString(scObj["scenarioId"] || key);
        if (!scenarioId) continue;

        const starsEarned = clampStarRating(scObj["starsEarned"]);
        const attemptsCount = Math.max(
          0,
          Math.floor(Number(scObj["attemptsCount"]) || 0),
        );
        const hintsUsedTotal = Math.max(
          0,
          Math.floor(Number(scObj["hintsUsedTotal"]) || 0),
        );
        const firstCompletedAt = clampTimestamp(
          scObj["firstCompletedAt"],
          exportedAt,
        );
        const lastCompletedAt = clampTimestamp(
          scObj["lastCompletedAt"],
          firstCompletedAt,
        );

        const sc: ScenarioProgress = {
          scenarioId,
          starsEarned,
          attemptsCount,
          hintsUsedTotal,
          firstCompletedAt: Math.min(firstCompletedAt, lastCompletedAt),
          lastCompletedAt: Math.max(firstCompletedAt, lastCompletedAt),
        };
        scenarios[scenarioId] = sc;
      }
    }

    // Sanitize Puzzles
    const rawPuzzles =
      obj["puzzles"] &&
      typeof obj["puzzles"] === "object" &&
      !Array.isArray(obj["puzzles"])
        ? (obj["puzzles"] as Record<string, unknown>)
        : {};

    // Rating profile
    const rawRp =
      rawPuzzles["ratingProfile"] &&
      typeof rawPuzzles["ratingProfile"] === "object" &&
      !Array.isArray(rawPuzzles["ratingProfile"])
        ? (rawPuzzles["ratingProfile"] as Record<string, unknown>)
        : {};

    const rating = Math.min(
      3000,
      Math.max(500, Math.round(Number(rawRp["rating"]) || 800)),
    );
    const ratingDeviation = Math.min(
      500,
      Math.max(50, Math.round(Number(rawRp["ratingDeviation"]) || 350)),
    );
    const peakRating = Math.min(
      3000,
      Math.max(
        500,
        Math.max(rating, Math.round(Number(rawRp["peakRating"]) || rating)),
      ),
    );
    const totalAttempted = Math.max(
      0,
      Math.floor(Number(rawRp["totalAttempted"]) || 0),
    );
    const totalSolved = Math.max(
      0,
      Math.min(totalAttempted, Math.floor(Number(rawRp["totalSolved"]) || 0)),
    );
    const bestStreak = Math.max(
      0,
      Math.floor(Number(rawRp["bestStreak"]) || 0),
    );

    // Rating history
    const ratingHistory: RatingHistoryPoint[] = [];
    if (Array.isArray(rawRp["ratingHistory"])) {
      for (const pt of rawRp["ratingHistory"]) {
        if (!pt || typeof pt !== "object") continue;
        const ptObj = pt as Record<string, unknown>;
        const puzzleId = sanitizeString(ptObj["puzzleId"]);
        const ptRating = Math.min(
          3000,
          Math.max(500, Math.round(Number(ptObj["rating"]) || 800)),
        );
        const delta = Math.round(Number(ptObj["delta"]) || 0);
        const timestamp = clampTimestamp(ptObj["timestamp"], exportedAt);
        ratingHistory.push({
          puzzleId,
          rating: ptRating,
          delta,
          timestamp,
        });
      }
    }

    // Theme mastery
    const themeMastery: Record<string, ThemeMasteryProgress> = {};
    const rawTm = rawPuzzles["themeMastery"];
    if (rawTm && typeof rawTm === "object" && !Array.isArray(rawTm)) {
      for (const [tKey, tVal] of Object.entries(
        rawTm as Record<string, unknown>,
      )) {
        if (!tVal || typeof tVal !== "object" || Array.isArray(tVal)) continue;
        const tmObj = tVal as Record<string, unknown>;
        const theme = sanitizeString(tmObj["theme"] || tKey) as PuzzleTheme;
        if (!theme) continue;

        const attempted = Math.max(
          0,
          Math.floor(Number(tmObj["attempted"]) || 0),
        );
        const solved = Math.max(
          0,
          Math.min(attempted, Math.floor(Number(tmObj["solved"]) || 0)),
        );
        const starsEarned = Math.max(
          0,
          Math.floor(Number(tmObj["starsEarned"]) || 0),
        );
        const lastPracticedAt = clampTimestamp(
          tmObj["lastPracticedAt"],
          exportedAt,
        );

        themeMastery[theme] = {
          theme,
          attempted,
          solved,
          starsEarned,
          masteryLevel: calculateMasteryLevel(solved),
          lastPracticedAt,
        };
      }
    }

    // Arcade stats
    const rawArcade =
      rawPuzzles["arcadeStats"] &&
      typeof rawPuzzles["arcadeStats"] === "object" &&
      !Array.isArray(rawPuzzles["arcadeStats"])
        ? (rawPuzzles["arcadeStats"] as Record<string, unknown>)
        : {};

    const arcadeStats = {
      puzzleRushHighScore: Math.max(
        0,
        Math.floor(Number(rawArcade["puzzleRushHighScore"]) || 0),
      ),
      puzzleRushBestStreak: Math.max(
        0,
        Math.floor(Number(rawArcade["puzzleRushBestStreak"]) || 0),
      ),
      streakSurvivorHighScore: Math.max(
        0,
        Math.floor(Number(rawArcade["streakSurvivorHighScore"]) || 0),
      ),
      totalRushRuns: Math.max(
        0,
        Math.floor(Number(rawArcade["totalRushRuns"]) || 0),
      ),
    };

    // Solved puzzles
    const solvedPuzzles: Record<string, SolvedPuzzleRecord> = {};
    const rawSolved = rawPuzzles["solvedPuzzles"];
    if (
      rawSolved &&
      typeof rawSolved === "object" &&
      !Array.isArray(rawSolved)
    ) {
      for (const [pKey, pVal] of Object.entries(
        rawSolved as Record<string, unknown>,
      )) {
        if (!pVal || typeof pVal !== "object" || Array.isArray(pVal)) continue;
        const spObj = pVal as Record<string, unknown>;
        const puzzleId = sanitizeString(pKey);
        if (!puzzleId) continue;

        const stars = clampStarRating(spObj["stars"]);
        const solvedAt = clampTimestamp(spObj["solvedAt"], exportedAt);
        solvedPuzzles[puzzleId] = {
          stars,
          solvedAt,
        };
      }
    }

    const createdAt = clampTimestamp(rawPuzzles["createdAt"], exportedAt);
    const lastActiveAt = clampTimestamp(rawPuzzles["lastActiveAt"], exportedAt);

    const puzzles: PuzzleProgress = {
      ratingProfile: {
        rating,
        ratingDeviation,
        peakRating,
        totalAttempted,
        totalSolved,
        bestStreak,
        ratingHistory: ratingHistory.slice(-50),
      },
      themeMastery,
      arcadeStats,
      solvedPuzzles,
      createdAt,
      lastActiveAt,
    };

    const sanitizedPayload: UnifiedProgressPayload = {
      version,
      exportedAt,
      ...(clientVersion ? { clientVersion } : {}),
      scenarios,
      puzzles,
    };

    return {
      success: true,
      data: sanitizedPayload,
    };
  }

  /**
   * Fast assertion that returns sanitized UnifiedProgressPayload or throws Error.
   *
   * @param raw - Unknown input value
   * @returns Sanitized valid payload
   * @throws Error if input is completely invalid
   */
  public assertValid(raw: unknown): UnifiedProgressPayload {
    const result = this.sanitizeAndValidate(raw);
    if (!result.success || !result.data) {
      const errorMsg =
        result.errors?.join(", ") || "Invalid progress payload structure";
      throw new Error(`Schema validation failed: ${errorMsg}`);
    }
    return result.data;
  }
}

/**
 * Singleton instance of DefaultSchemaValidator.
 */
export const defaultSchemaValidator = new DefaultSchemaValidator();
export const schemaValidator = defaultSchemaValidator;

/**
 * Convenience helper to validate and sanitize progress payload.
 */
export function sanitizeAndValidateProgress(
  raw: unknown,
): ValidationResult<UnifiedProgressPayload> {
  return defaultSchemaValidator.sanitizeAndValidate(raw);
}

/**
 * Convenience helper to assert valid progress payload.
 */
export function assertValidProgress(raw: unknown): UnifiedProgressPayload {
  return defaultSchemaValidator.assertValid(raw);
}
