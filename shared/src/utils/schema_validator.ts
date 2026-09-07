import { z } from "zod";
import type {
  SchemaValidator,
  ValidationResult,
  UnifiedProgressPayload,
} from "../types/progress_sync.js";
import { UNIFIED_PROGRESS_SCHEMA_VERSION } from "../types/progress_sync.js";
import type {
  ScenarioProgressMap,
  StarRating,
} from "../contracts/scenario.js";
import {
  type PuzzleProgress,
  type PuzzleTheme,
  type ThemeMasteryProgress,
  type SolvedPuzzleRecord,
  type RatingHistoryPoint,
  calculateMasteryLevel,
} from "../contracts/puzzle.js";

/**
 * Strips non-printable and ASCII control characters from strings.
 * Rejects dangerous prototype property names to prevent prototype pollution.
 *
 * @param str - Input value
 * @returns Sanitized trimmed string, or empty string if invalid/forbidden
 */
function sanitizeString(str: unknown): string {
  if (typeof str !== "string") return "";
  const sanitized = str.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
  if (
    sanitized === "__proto__" ||
    sanitized === "constructor" ||
    sanitized === "prototype"
  ) {
    return "";
  }
  return sanitized;
}

/**
 * Clamps numeric timestamps to [0, referenceNow + 86400000].
 *
 * @param val - Input value
 * @param fallback - Fallback value if missing or invalid
 * @param referenceNowMs - Optional reference time for clock skew tolerance
 * @returns Clamped timestamp in epoch ms
 */
function clampTimestamp(
  val: unknown,
  fallback?: number,
  referenceNowMs?: number,
): number {
  const maxTimestamp = (referenceNowMs ?? Date.now()) + 86400000; // 24 hours buffer for clock skew
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
 *
 * @param val - Input value
 * @returns Valid StarRating (1, 2, or 3)
 */
function clampStarRating(val: unknown): StarRating {
  const num = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(num)) return 1;
  if (num >= 3) return 3;
  if (num >= 2) return 2;
  return 1;
}

// --- Declarative Zod Transform Primitives ---

const NonNegativeIntSchema = z.unknown().transform((val) => {
  const num = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.floor(num));
});

const createRatingHistoryPointSchema = (
  exportedAt: number,
  referenceNowMs?: number,
) =>
  z.object({
    puzzleId: z.unknown().transform(sanitizeString),
    rating: z.unknown().transform((val) => {
      const num = Math.round(Number(val) || 800);
      return Math.min(3000, Math.max(500, num));
    }),
    delta: z.unknown().transform((val) => Math.round(Number(val) || 0)),
    timestamp: z
      .unknown()
      .transform((val) => clampTimestamp(val, exportedAt, referenceNowMs)),
  });

const createRatingProfileSchema = (
  exportedAt: number,
  referenceNowMs?: number,
) =>
  z
    .object({
      rating: z.unknown().optional(),
      ratingDeviation: z.unknown().optional(),
      peakRating: z.unknown().optional(),
      totalAttempted: z.unknown().optional(),
      totalSolved: z.unknown().optional(),
      bestStreak: z.unknown().optional(),
      ratingHistory: z.unknown().optional(),
    })
    .transform((rawRp) => {
      const rating = Math.min(
        3000,
        Math.max(500, Math.round(Number(rawRp.rating) || 800)),
      );
      const ratingDeviation = Math.min(
        500,
        Math.max(50, Math.round(Number(rawRp.ratingDeviation) || 350)),
      );
      const peakRating = Math.min(
        3000,
        Math.max(
          500,
          Math.max(rating, Math.round(Number(rawRp.peakRating) || rating)),
        ),
      );
      const totalAttempted = Math.max(
        0,
        Math.floor(Number(rawRp.totalAttempted) || 0),
      );
      const totalSolved = Math.max(
        0,
        Math.min(totalAttempted, Math.floor(Number(rawRp.totalSolved) || 0)),
      );
      const bestStreak = Math.max(
        0,
        Math.floor(Number(rawRp.bestStreak) || 0),
      );

      const ratingHistory: RatingHistoryPoint[] = [];
      if (Array.isArray(rawRp.ratingHistory)) {
        const itemSchema = createRatingHistoryPointSchema(
          exportedAt,
          referenceNowMs,
        );
        for (const pt of rawRp.ratingHistory) {
          if (!pt || typeof pt !== "object") continue;
          const parsed = itemSchema.safeParse(pt);
          if (parsed.success) {
            ratingHistory.push(parsed.data);
          }
        }
      }

      return {
        rating,
        ratingDeviation,
        peakRating,
        totalAttempted,
        totalSolved,
        bestStreak,
        ratingHistory: ratingHistory.slice(-50),
      };
    });

const createThemeMasterySchema = (
  exportedAt: number,
  referenceNowMs?: number,
) =>
  z.record(z.unknown()).transform((rawThemes) => {
    const themeMastery: Record<string, ThemeMasteryProgress> = {};
    for (const [tKey, tVal] of Object.entries(rawThemes)) {
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
        referenceNowMs,
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
    return themeMastery;
  });

const ArcadeStatsSchema = z
  .object({
    puzzleRushHighScore: NonNegativeIntSchema.optional(),
    puzzleRushBestStreak: NonNegativeIntSchema.optional(),
    streakSurvivorHighScore: NonNegativeIntSchema.optional(),
    totalRushRuns: NonNegativeIntSchema.optional(),
  })
  .transform((rawArcade) => ({
    puzzleRushHighScore: rawArcade.puzzleRushHighScore ?? 0,
    puzzleRushBestStreak: rawArcade.puzzleRushBestStreak ?? 0,
    streakSurvivorHighScore: rawArcade.streakSurvivorHighScore ?? 0,
    totalRushRuns: rawArcade.totalRushRuns ?? 0,
  }));

const createSolvedPuzzlesSchema = (
  exportedAt: number,
  referenceNowMs?: number,
) =>
  z.record(z.unknown()).transform((rawSolved) => {
    const solvedPuzzles: Record<string, SolvedPuzzleRecord> = {};
    for (const [pKey, pVal] of Object.entries(rawSolved)) {
      if (!pVal || typeof pVal !== "object" || Array.isArray(pVal)) continue;
      const spObj = pVal as Record<string, unknown>;
      const puzzleId = sanitizeString(pKey);
      if (!puzzleId) continue;

      const stars = clampStarRating(spObj["stars"]);
      const solvedAt = clampTimestamp(
        spObj["solvedAt"],
        exportedAt,
        referenceNowMs,
      );
      solvedPuzzles[puzzleId] = {
        stars,
        solvedAt,
      };
    }
    return solvedPuzzles;
  });

const createScenariosMapSchema = (
  exportedAt: number,
  referenceNowMs?: number,
) =>
  z.record(z.unknown()).transform((rawScenarios) => {
    const scenarios: ScenarioProgressMap = {};
    for (const [key, rawSc] of Object.entries(rawScenarios)) {
      if (!rawSc || typeof rawSc !== "object" || Array.isArray(rawSc)) continue;
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
        referenceNowMs,
      );
      const lastCompletedAt = clampTimestamp(
        scObj["lastCompletedAt"],
        firstCompletedAt,
        referenceNowMs,
      );

      scenarios[scenarioId] = {
        scenarioId,
        starsEarned,
        attemptsCount,
        hintsUsedTotal,
        firstCompletedAt: Math.min(firstCompletedAt, lastCompletedAt),
        lastCompletedAt: Math.max(firstCompletedAt, lastCompletedAt),
      };
    }
    return scenarios;
  });

const createPuzzlesSchema = (
  exportedAt: number,
  referenceNowMs?: number,
) =>
  z
    .object({
      ratingProfile: z.unknown().optional(),
      themeMastery: z.unknown().optional(),
      arcadeStats: z.unknown().optional(),
      solvedPuzzles: z.unknown().optional(),
      createdAt: z.unknown().optional(),
      lastActiveAt: z.unknown().optional(),
    })
    .transform((rawPuzzles): PuzzleProgress => {
      const rpInput =
        rawPuzzles.ratingProfile &&
        typeof rawPuzzles.ratingProfile === "object" &&
        !Array.isArray(rawPuzzles.ratingProfile)
          ? rawPuzzles.ratingProfile
          : {};
      const ratingProfile = createRatingProfileSchema(
        exportedAt,
        referenceNowMs,
      ).parse(rpInput);

      const tmInput =
        rawPuzzles.themeMastery &&
        typeof rawPuzzles.themeMastery === "object" &&
        !Array.isArray(rawPuzzles.themeMastery)
          ? (rawPuzzles.themeMastery as Record<string, unknown>)
          : {};
      const themeMastery = createThemeMasterySchema(
        exportedAt,
        referenceNowMs,
      ).parse(tmInput);

      const arcInput =
        rawPuzzles.arcadeStats &&
        typeof rawPuzzles.arcadeStats === "object" &&
        !Array.isArray(rawPuzzles.arcadeStats)
          ? rawPuzzles.arcadeStats
          : {};
      const arcadeStats = ArcadeStatsSchema.parse(arcInput);

      const spInput =
        rawPuzzles.solvedPuzzles &&
        typeof rawPuzzles.solvedPuzzles === "object" &&
        !Array.isArray(rawPuzzles.solvedPuzzles)
          ? (rawPuzzles.solvedPuzzles as Record<string, unknown>)
          : {};
      const solvedPuzzles = createSolvedPuzzlesSchema(
        exportedAt,
        referenceNowMs,
      ).parse(spInput);

      const createdAt = clampTimestamp(
        rawPuzzles.createdAt,
        exportedAt,
        referenceNowMs,
      );
      const lastActiveAt = clampTimestamp(
        rawPuzzles.lastActiveAt,
        exportedAt,
        referenceNowMs,
      );

      return {
        ratingProfile,
        themeMastery,
        arcadeStats,
        solvedPuzzles,
        createdAt,
        lastActiveAt,
      };
    });

/**
 * Default implementation of SchemaValidator enforcing Rugged Software principles
 * with declarative Zod schemas, robust defensive clamping, and boundary validation.
 */
export class DefaultSchemaValidator implements SchemaValidator {
  /**
   * Validates and defensively sanitizes unknown input into a valid UnifiedProgressPayload.
   *
   * @param raw - Unknown input value
   * @param referenceNowMs - Optional reference time for clock skew tolerance and timestamp clamping
   * @returns ValidationResult with sanitized data or descriptive errors
   */
  public sanitizeAndValidate(
    raw: unknown,
    referenceNowMs?: number,
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
    const now = referenceNowMs ?? Date.now();
    const exportedAt = clampTimestamp(obj["exportedAt"], now, referenceNowMs);

    // Client version
    const rawClientVersion = obj["clientVersion"];
    const clientVersion =
      typeof rawClientVersion === "string"
        ? sanitizeString(rawClientVersion)
        : undefined;

    // Scenarios
    const rawScenarios =
      obj["scenarios"] &&
      typeof obj["scenarios"] === "object" &&
      !Array.isArray(obj["scenarios"])
        ? (obj["scenarios"] as Record<string, unknown>)
        : {};
    const scenarios = createScenariosMapSchema(
      exportedAt,
      referenceNowMs,
    ).parse(rawScenarios);

    // Puzzles
    const rawPuzzles =
      obj["puzzles"] &&
      typeof obj["puzzles"] === "object" &&
      !Array.isArray(obj["puzzles"])
        ? (obj["puzzles"] as Record<string, unknown>)
        : {};
    const puzzles = createPuzzlesSchema(exportedAt, referenceNowMs).parse(
      rawPuzzles,
    );

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
   * @param referenceNowMs - Optional reference time for clock skew tolerance
   * @returns Sanitized valid payload
   * @throws Error if input is completely invalid
   */
  public assertValid(
    raw: unknown,
    referenceNowMs?: number,
  ): UnifiedProgressPayload {
    const result = this.sanitizeAndValidate(raw, referenceNowMs);
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
 *
 * @param raw - Unknown input value
 * @param referenceNowMs - Optional reference time for clock skew tolerance
 * @returns ValidationResult with sanitized data or descriptive errors
 */
export function sanitizeAndValidateProgress(
  raw: unknown,
  referenceNowMs?: number,
): ValidationResult<UnifiedProgressPayload> {
  return defaultSchemaValidator.sanitizeAndValidate(raw, referenceNowMs);
}

/**
 * Convenience helper to assert valid progress payload.
 *
 * @param raw - Unknown input value
 * @param referenceNowMs - Optional reference time for clock skew tolerance
 * @returns Sanitized valid payload
 * @throws Error if input is invalid
 */
export function assertValidProgress(
  raw: unknown,
  referenceNowMs?: number,
): UnifiedProgressPayload {
  return defaultSchemaValidator.assertValid(raw, referenceNowMs);
}
