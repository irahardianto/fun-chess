import { describe, it, expect } from "vitest";
import type { UnifiedProgressPayload } from "../../types/progress_sync.js";
import {
  DefaultSchemaValidator,
  schemaValidator,
  sanitizeAndValidateProgress,
  assertValidProgress,
} from "../schema_validator.js";

describe("Schema Validator (Defensive Validation, Sanitization & Clamping)", () => {
  const validator = schemaValidator ?? new DefaultSchemaValidator();

  const createCleanPayload = (): UnifiedProgressPayload => ({
    version: 1,
    exportedAt: 1700000000000,
    clientVersion: "1.0.0",
    scenarios: {
      "lesson-1": {
        scenarioId: "lesson-1",
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1699999000000,
        lastCompletedAt: 1700000000000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: 1200,
        ratingDeviation: 150,
        peakRating: 1250,
        totalAttempted: 20,
        totalSolved: 15,
        bestStreak: 6,
        ratingHistory: [
          {
            timestamp: 1699999000000,
            rating: 1200,
            puzzleId: "puz_001",
            delta: 15,
          },
        ],
      },
      themeMastery: {
        fork: {
          theme: "fork",
          attempted: 10,
          solved: 8,
          starsEarned: 15,
          masteryLevel: "apprentice",
          lastPracticedAt: 1700000000000,
        },
      },
      arcadeStats: {
        puzzleRushHighScore: 18,
        puzzleRushBestStreak: 6,
        streakSurvivorHighScore: 12,
        totalRushRuns: 5,
      },
      solvedPuzzles: {
        puz_001: {
          stars: 3,
          solvedAt: 1699999000000,
        },
      },
      createdAt: 1699000000000,
      lastActiveAt: 1700000000000,
    },
  });

  describe("Valid Payload Validation", () => {
    it("passes a fully compliant domain payload cleanly without errors", () => {
      // Arrange
      const validPayload = createCleanPayload();

      // Act
      const result = validator.sanitizeAndValidate(validPayload);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.version).toBe(1);
      expect(result.data?.puzzles.ratingProfile.rating).toBe(1200);
      expect(result.data?.scenarios["lesson-1"]?.starsEarned).toBe(3);
    });

    it("assertValid returns data directly for valid payload without throwing", () => {
      // Arrange
      const validPayload = createCleanPayload();

      // Act
      const data = validator.assertValid(validPayload);

      // Assert
      expect(data.version).toBe(1);
      expect(data.puzzles.ratingProfile.rating).toBe(1200);
    });
  });

  describe("Range Clamping & Defensive Value Normalization", () => {
    it("clamps Elo Rating to [500, 3000]", () => {
      // Arrange
      const lowRatingPayload = {
        ...createCleanPayload(),
        puzzles: {
          ...createCleanPayload().puzzles,
          ratingProfile: {
            ...createCleanPayload().puzzles.ratingProfile,
            rating: 200, // Below 500 floor
            peakRating: 4500, // Above 3000 ceiling
          },
        },
      };

      // Act
      const result = validator.sanitizeAndValidate(lowRatingPayload);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data?.puzzles.ratingProfile.rating).toBe(500);
      expect(result.data?.puzzles.ratingProfile.peakRating).toBe(3000);
    });

    it("clamps Rating Deviation (RD) to [50, 500]", () => {
      // Arrange
      const lowRdPayload = {
        ...createCleanPayload(),
        puzzles: {
          ...createCleanPayload().puzzles,
          ratingProfile: {
            ...createCleanPayload().puzzles.ratingProfile,
            ratingDeviation: 10, // Below 50 floor
          },
        },
      };

      const highRdPayload = {
        ...createCleanPayload(),
        puzzles: {
          ...createCleanPayload().puzzles,
          ratingProfile: {
            ...createCleanPayload().puzzles.ratingProfile,
            ratingDeviation: 999, // Above 500 ceiling
          },
        },
      };

      // Act
      const lowResult = validator.sanitizeAndValidate(lowRdPayload);
      const highResult = validator.sanitizeAndValidate(highRdPayload);

      // Assert
      expect(lowResult.data?.puzzles.ratingProfile.ratingDeviation).toBe(50);
      expect(highResult.data?.puzzles.ratingProfile.ratingDeviation).toBe(500);
    });

    it("clamps Stars to valid set {1, 2, 3}", () => {
      // Arrange
      const badStarsPayload = {
        ...createCleanPayload(),
        scenarios: {
          "neg-stars": {
            scenarioId: "neg-stars",
            starsEarned: -5 as unknown as 1,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 1700000000000,
            lastCompletedAt: 1700000000000,
          },
          "zero-stars": {
            scenarioId: "zero-stars",
            starsEarned: 0 as unknown as 1,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 1700000000000,
            lastCompletedAt: 1700000000000,
          },
          "huge-stars": {
            scenarioId: "huge-stars",
            starsEarned: 10 as unknown as 3,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 1700000000000,
            lastCompletedAt: 1700000000000,
          },
        },
        puzzles: {
          ...createCleanPayload().puzzles,
          solvedPuzzles: {
            puz_high: { stars: 5 as unknown as 3, solvedAt: 1700000000000 },
            puz_zero: { stars: 0 as unknown as 1, solvedAt: 1700000000000 },
          },
        },
      };

      // Act
      const result = validator.sanitizeAndValidate(badStarsPayload);

      // Assert
      expect(result.data?.scenarios["neg-stars"]?.starsEarned).toBe(1);
      expect(result.data?.scenarios["zero-stars"]?.starsEarned).toBe(1);
      expect(result.data?.scenarios["huge-stars"]?.starsEarned).toBe(3);

      expect(result.data?.puzzles.solvedPuzzles.puz_high?.stars).toBe(3);
      expect(result.data?.puzzles.solvedPuzzles.puz_zero?.stars).toBe(1);
    });

    it("clamps non-negative counts and scores using Math.max(0, Math.floor(x))", () => {
      // Arrange
      const negativeCountsPayload = {
        ...createCleanPayload(),
        scenarios: {
          "lesson-1": {
            scenarioId: "lesson-1",
            starsEarned: 2,
            attemptsCount: -10,
            hintsUsedTotal: -5,
            firstCompletedAt: 1700000000000,
            lastCompletedAt: 1700000000000,
          },
        },
        puzzles: {
          ...createCleanPayload().puzzles,
          ratingProfile: {
            ...createCleanPayload().puzzles.ratingProfile,
            totalAttempted: -50,
            totalSolved: -20,
            bestStreak: -10,
          },
          arcadeStats: {
            puzzleRushHighScore: 15.7,
            puzzleRushBestStreak: -3,
            streakSurvivorHighScore: -1,
            totalRushRuns: 8.9,
          },
        },
      };

      // Act
      const result = validator.sanitizeAndValidate(negativeCountsPayload);

      // Assert
      expect(result.data?.scenarios["lesson-1"]?.attemptsCount).toBe(0);
      expect(result.data?.scenarios["lesson-1"]?.hintsUsedTotal).toBe(0);
      expect(result.data?.puzzles.ratingProfile.totalAttempted).toBe(0);
      expect(result.data?.puzzles.ratingProfile.totalSolved).toBe(0);
      expect(result.data?.puzzles.ratingProfile.bestStreak).toBe(0);
      expect(result.data?.puzzles.arcadeStats.puzzleRushHighScore).toBe(15);
      expect(result.data?.puzzles.arcadeStats.puzzleRushBestStreak).toBe(0);
      expect(result.data?.puzzles.arcadeStats.streakSurvivorHighScore).toBe(0);
      expect(result.data?.puzzles.arcadeStats.totalRushRuns).toBe(8);
    });

    it("clamps future timestamps exceeding 24h into the future", () => {
      // Arrange
      const farFuture = Date.now() + 1000 * 86400000; // 1000 days in the future
      const futurePayload = {
        ...createCleanPayload(),
        exportedAt: farFuture,
      };

      // Act
      const result = validator.sanitizeAndValidate(futurePayload);

      // Assert
      const maxAllowed = Date.now() + 86400000;
      expect(result.data?.exportedAt).toBeLessThanOrEqual(maxAllowed);
    });

    it("sanitizes strings by trimming and stripping non-printable control characters", () => {
      // Arrange
      const dirtyPayload = {
        ...createCleanPayload(),
        clientVersion: "  1.0.0\x00\x08\x1F  ",
        scenarios: {
          "  dirty-id\x07  ": {
            scenarioId: "  dirty-id\x07  ",
            starsEarned: 3,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 1700000000000,
            lastCompletedAt: 1700000000000,
          },
        },
      };

      // Act
      const result = validator.sanitizeAndValidate(dirtyPayload);

      // Assert
      expect(result.data?.clientVersion).toBe("1.0.0");
      expect(result.data?.scenarios["dirty-id"]).toBeDefined();
      expect(result.data?.scenarios["dirty-id"]?.scenarioId).toBe("dirty-id");
    });
  });

  describe("Corrupted & Malformed Inputs Handling", () => {
    it("rejects primitive inputs (string, null, number, boolean, undefined)", () => {
      // Act & Assert
      expect(validator.sanitizeAndValidate("plain string").success).toBe(false);
      expect(validator.sanitizeAndValidate(null).success).toBe(false);
      expect(validator.sanitizeAndValidate(12345).success).toBe(false);
      expect(validator.sanitizeAndValidate(true).success).toBe(false);
      expect(validator.sanitizeAndValidate(undefined).success).toBe(false);
    });

    it("rejects array inputs when expecting root object", () => {
      // Act & Assert
      const result = validator.sanitizeAndValidate([1, 2, 3]);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("object");
    });

    it("assertValid throws Error on unrecoverable malformed inputs", () => {
      // Act & Assert
      expect(() => validator.assertValid(null)).toThrow(
        "Invalid progress payload",
      );
      expect(() => validator.assertValid("malformed")).toThrow(
        "Invalid progress payload",
      );
      expect(() => validator.assertValid([1, 2])).toThrow(
        "Invalid progress payload",
      );
    });

    it("gracefully reconstructs missing sub-trees with sensible defaults", () => {
      // Arrange: bare minimal object with missing puzzles, scenarios, etc.
      const bareObject = {
        version: 1,
        exportedAt: 1700000000000,
      };

      // Act
      const result = validator.sanitizeAndValidate(bareObject);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.scenarios).toEqual({});
      expect(result.data?.puzzles.ratingProfile.rating).toBe(800);
      expect(result.data?.puzzles.themeMastery).toEqual({});
      expect(result.data?.puzzles.solvedPuzzles).toEqual({});
    });
  });

  describe("Functional Export Helpers", () => {
    it("provides functional shortcuts sanitizeAndValidateProgress and assertValidProgress", () => {
      // Arrange
      const clean = createCleanPayload();

      // Act
      const result = sanitizeAndValidateProgress(clean);
      const data = assertValidProgress(clean);

      // Assert
      expect(result.success).toBe(true);
      expect(data.version).toBe(1);
      expect(() => assertValidProgress(null)).toThrow();
    });
  });
});
