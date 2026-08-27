import { describe, it, expect } from "vitest";
import type { UnifiedProgressPayload } from "../../types/progress_sync.js";
import {
  DefaultProgressMergeEngine,
  progressMergeEngine,
  mergeUnifiedProgress,
  calculateProgressDiff,
} from "../progress_merger.js";

describe("Progress Merger (Pure Mathematical Smart Merge & Diff Engine)", () => {
  const merger = progressMergeEngine ?? new DefaultProgressMergeEngine();

  const createLocalPayload = (): UnifiedProgressPayload => ({
    version: 1,
    exportedAt: 1700000000000,
    clientVersion: "1.0.0",
    scenarios: {
      "lesson-1": {
        scenarioId: "lesson-1",
        starsEarned: 2,
        attemptsCount: 3,
        hintsUsedTotal: 1,
        firstCompletedAt: 1699990000000,
        lastCompletedAt: 1699995000000,
      },
      "lesson-2": {
        scenarioId: "lesson-2",
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1699992000000,
        lastCompletedAt: 1699992000000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: 1100,
        ratingDeviation: 120,
        peakRating: 1150,
        totalAttempted: 30,
        totalSolved: 20,
        bestStreak: 5,
        ratingHistory: [],
      },
      themeMastery: {
        fork: {
          theme: "fork",
          attempted: 15,
          solved: 10,
          starsEarned: 12,
          masteryLevel: "apprentice",
          lastPracticedAt: 1699990000000,
        },
      },
      arcadeStats: {
        puzzleRushHighScore: 15,
        puzzleRushBestStreak: 5,
        streakSurvivorHighScore: 10,
        totalRushRuns: 6,
      },
      solvedPuzzles: {
        puz_001: {
          stars: 2,
          solvedAt: 1699990000000,
        },
      },
      createdAt: 1699000000000,
      lastActiveAt: 1699995000000,
    },
  });

  const createIncomingPayload = (): UnifiedProgressPayload => ({
    version: 1,
    exportedAt: 1700001000000,
    clientVersion: "1.1.0",
    scenarios: {
      "lesson-1": {
        scenarioId: "lesson-1",
        starsEarned: 3, // Upgrade from 2 to 3
        attemptsCount: 2,
        hintsUsedTotal: 0,
        firstCompletedAt: 1699988000000, // Earlier first completion
        lastCompletedAt: 1700000000000, // Later last completion
      },
      "lesson-3": {
        scenarioId: "lesson-3", // New scenario
        starsEarned: 1,
        attemptsCount: 4,
        hintsUsedTotal: 2,
        firstCompletedAt: 1699998000000,
        lastCompletedAt: 1699998000000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: 1300, // Higher rating
        ratingDeviation: 80, // Lower RD (higher confidence)
        peakRating: 1350, // Higher peak
        totalAttempted: 25,
        totalSolved: 22,
        bestStreak: 9, // Better streak
        ratingHistory: [],
      },
      themeMastery: {
        fork: {
          theme: "fork",
          attempted: 10,
          solved: 10,
          starsEarned: 15,
          masteryLevel: "apprentice",
          lastPracticedAt: 1700000000000, // Later practice
        },
        pin: {
          theme: "pin", // New theme
          attempted: 8,
          solved: 8,
          starsEarned: 8,
          masteryLevel: "apprentice",
          lastPracticedAt: 1700000000000,
        },
      },
      arcadeStats: {
        puzzleRushHighScore: 22, // Higher score
        puzzleRushBestStreak: 8, // Better streak
        streakSurvivorHighScore: 8, // Lower score than local (10)
        totalRushRuns: 4,
      },
      solvedPuzzles: {
        puz_001: {
          stars: 3, // Higher star
          solvedAt: 1699989000000, // Earlier solve
        },
        puz_002: {
          stars: 2, // New solved puzzle
          solvedAt: 1699999000000,
        },
      },
      createdAt: 1699000000000,
      lastActiveAt: 1700000000000,
    },
  });

  describe("Strategy: keep_local", () => {
    it("returns an identical deep copy of local progress without incorporating incoming data", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = merger.merge(local, incoming, "keep_local");

      // Assert
      expect(merged).toEqual(local);
      expect(merged).not.toBe(local); // Deep copy immutability check
      expect(merged.puzzles.ratingProfile.rating).toBe(1100);
      expect(merged.scenarios["lesson-3"]).toBeUndefined();
    });
  });

  describe("Strategy: replace_local", () => {
    it("returns an identical deep copy of incoming progress replacing local state entirely", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = merger.merge(local, incoming, "replace_local");

      // Assert
      expect(merged).toEqual(incoming);
      expect(merged).not.toBe(incoming); // Deep copy immutability check
      expect(merged.puzzles.ratingProfile.rating).toBe(1300);
      expect(merged.scenarios["lesson-2"]).toBeUndefined(); // Local lesson-2 is replaced away
      expect(merged.scenarios["lesson-3"]).toBeDefined();
    });
  });

  describe("Strategy: smart_merge", () => {
    it("unions scenarios with max stars, summed attempts/hints, min firstCompletedAt, and max lastCompletedAt", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = merger.merge(local, incoming, "smart_merge");

      // Assert
      // Scenarios union contains lesson-1, lesson-2, and lesson-3
      expect(Object.keys(merged.scenarios)).toHaveLength(3);

      const sc1 = merged.scenarios["lesson-1"];
      expect(sc1).toBeDefined();
      expect(sc1?.starsEarned).toBe(3); // Math.max(2, 3)
      expect(sc1?.attemptsCount).toBe(5); // 3 + 2
      expect(sc1?.hintsUsedTotal).toBe(1); // 1 + 0
      expect(sc1?.firstCompletedAt).toBe(1699988000000); // Math.min
      expect(sc1?.lastCompletedAt).toBe(1700000000000); // Math.max

      // Local-only scenario preserved
      expect(merged.scenarios["lesson-2"]?.starsEarned).toBe(3);
      // Incoming-only scenario included
      expect(merged.scenarios["lesson-3"]?.starsEarned).toBe(1);
    });

    it("merges puzzle ratings with max rating, max peakRating, and min RD (higher confidence)", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = merger.merge(local, incoming, "smart_merge");

      // Assert
      const rp = merged.puzzles.ratingProfile;
      expect(rp.rating).toBe(1300); // Math.max(1100, 1300)
      expect(rp.peakRating).toBe(1350); // Math.max(1150, 1350, 1300)
      expect(rp.ratingDeviation).toBe(80); // Math.min(120, 80)
    });

    it("sums totalAttempted / totalSolved and takes Math.max of bestStreak", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = merger.merge(local, incoming, "smart_merge");

      // Assert
      const rp = merged.puzzles.ratingProfile;
      expect(rp.totalAttempted).toBe(55); // 30 + 25
      expect(rp.totalSolved).toBe(42); // 20 + 22
      expect(rp.bestStreak).toBe(9); // Math.max(5, 9)
    });

    it("unions solved puzzles with max stars and min solvedAt", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = merger.merge(local, incoming, "smart_merge");

      // Assert
      const sp = merged.puzzles.solvedPuzzles;
      expect(Object.keys(sp)).toHaveLength(2);
      expect(sp.puz_001?.stars).toBe(3); // Math.max(2, 3)
      expect(sp.puz_001?.solvedAt).toBe(1699989000000); // Math.min(1699990000000, 1699989000000)
      expect(sp.puz_002?.stars).toBe(2);
    });

    it("unions theme mastery summing attempts/solved/stars and recalculating mastery level", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = merger.merge(local, incoming, "smart_merge");

      // Assert
      const tm = merged.puzzles.themeMastery;
      expect(Object.keys(tm)).toHaveLength(2);

      const fork = tm.fork;
      expect(fork).toBeDefined();
      expect(fork?.attempted).toBe(25); // 15 + 10
      expect(fork?.solved).toBe(20); // 10 + 10
      expect(fork?.starsEarned).toBe(27); // 12 + 15
      expect(fork?.masteryLevel).toBe("master"); // solved >= 20 or stars >= 20 -> 'master'
      expect(fork?.lastPracticedAt).toBe(1700000000000); // Math.max

      expect(tm.pin?.solved).toBe(8);
      expect(tm.pin?.masteryLevel).toBe("apprentice");
    });

    it("merges arcade stats with max high scores / best streaks and summed rush runs", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = merger.merge(local, incoming, "smart_merge");

      // Assert
      const ac = merged.puzzles.arcadeStats;
      expect(ac.puzzleRushHighScore).toBe(22); // Math.max(15, 22)
      expect(ac.puzzleRushBestStreak).toBe(8); // Math.max(5, 8)
      expect(ac.streakSurvivorHighScore).toBe(10); // Math.max(10, 8) -> preserves local higher score
      expect(ac.totalRushRuns).toBe(10); // 6 + 4
    });
  });

  describe("Diff Preview Calculation (calculateDiff)", () => {
    it("correctly calculates hasDifferences=true and hasUpgrades=true when incoming contains better progress", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const diff = merger.calculateDiff(local, incoming);

      // Assert
      expect(diff.hasDifferences).toBe(true);
      expect(diff.hasUpgrades).toBe(true);

      // Academy diff
      expect(diff.academy.localCompletedCount).toBe(2);
      expect(diff.academy.incomingCompletedCount).toBe(2);
      expect(diff.academy.mergedCompletedCount).toBe(3);
      expect(diff.academy.newCompletedScenarios).toContain("lesson-3");
      expect(diff.academy.starUpgrades).toEqual([
        {
          scenarioId: "lesson-1",
          fromStars: 2,
          toStars: 3,
        },
      ]);

      // Puzzles diff
      expect(diff.puzzles.localRating).toBe(1100);
      expect(diff.puzzles.incomingRating).toBe(1300);
      expect(diff.puzzles.mergedRating).toBe(1300);
      expect(diff.puzzles.newPuzzlesSolvedCount).toBe(1); // puz_002

      // Arcade diff
      expect(diff.arcade.localRushHighScore).toBe(15);
      expect(diff.arcade.incomingRushHighScore).toBe(22);
      expect(diff.arcade.mergedRushHighScore).toBe(22);
      expect(diff.arcade.localSurvivorHighScore).toBe(10);
      expect(diff.arcade.incomingSurvivorHighScore).toBe(8);
      expect(diff.arcade.mergedSurvivorHighScore).toBe(10);

      // Metadata diff
      expect(diff.metadata.isIncomingNewer).toBe(true);
    });

    it("returns hasDifferences=false and hasUpgrades=false for identical payloads", () => {
      // Arrange
      const local = createLocalPayload();
      const identical = createLocalPayload();

      // Act
      const diff = merger.calculateDiff(local, identical);

      // Assert
      expect(diff.hasDifferences).toBe(false);
      expect(diff.hasUpgrades).toBe(false);
      expect(diff.academy.newCompletedScenarios).toHaveLength(0);
      expect(diff.academy.starUpgrades).toHaveLength(0);
      expect(diff.puzzles.newPuzzlesSolvedCount).toBe(0);
    });
  });

  describe("Partial Progress Payloads & Missing Puzzles", () => {
    it("safely handles smart_merge when local or incoming is missing puzzles", () => {
      // Arrange
      const localWithoutPuzzles = {
        version: 1,
        exportedAt: 1700000000000,
        clientVersion: "1.0.0",
        scenarios: {
          "lesson-1": {
            scenarioId: "lesson-1",
            starsEarned: 2 as const,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 1699990000000,
            lastCompletedAt: 1699990000000,
          },
        },
      } as unknown as UnifiedProgressPayload;

      const incomingWithPuzzles = createIncomingPayload();

      // Act
      const merged = merger.merge(
        localWithoutPuzzles,
        incomingWithPuzzles,
        "smart_merge",
      );

      // Assert
      expect(merged.scenarios["lesson-1"]?.starsEarned).toBe(3);
      expect(merged.puzzles.ratingProfile.rating).toBe(1300);
      expect(merged.puzzles.ratingProfile.peakRating).toBe(1350);
      expect(merged.puzzles.solvedPuzzles.puz_001?.stars).toBe(3);
    });

    it("safely handles smart_merge when incoming is missing puzzles", () => {
      // Arrange
      const localWithPuzzles = createLocalPayload();
      const incomingWithoutPuzzles = {
        version: 1,
        exportedAt: 1700001000000,
        clientVersion: "1.1.0",
        scenarios: {},
      } as unknown as UnifiedProgressPayload;

      // Act
      const merged = merger.merge(
        localWithPuzzles,
        incomingWithoutPuzzles,
        "smart_merge",
      );

      // Assert
      expect(merged.puzzles.ratingProfile.rating).toBe(1100);
      expect(merged.puzzles.ratingProfile.peakRating).toBe(1150);
      expect(merged.puzzles.solvedPuzzles.puz_001?.stars).toBe(2);
    });

    it("safely handles smart_merge when both local and incoming are missing puzzles", () => {
      // Arrange
      const localWithoutPuzzles = {
        version: 1,
        exportedAt: 1700000000000,
        scenarios: {},
      } as unknown as UnifiedProgressPayload;

      const incomingWithoutPuzzles = {
        version: 1,
        exportedAt: 1700001000000,
        scenarios: {},
      } as unknown as UnifiedProgressPayload;

      // Act
      const merged = merger.merge(
        localWithoutPuzzles,
        incomingWithoutPuzzles,
        "smart_merge",
      );

      // Assert
      expect(merged.puzzles).toBeDefined();
      expect(merged.puzzles.ratingProfile.rating).toBe(800);
      expect(merged.puzzles.ratingProfile.ratingDeviation).toBe(350);
      expect(merged.puzzles.solvedPuzzles).toEqual({});
      expect(merged.puzzles.themeMastery).toEqual({});
    });

    it("safely calculates diff when local or incoming is missing puzzles without throwing", () => {
      // Arrange
      const localWithoutPuzzles = {
        version: 1,
        exportedAt: 1700000000000,
        scenarios: {},
      } as unknown as UnifiedProgressPayload;

      const incomingWithPuzzles = createIncomingPayload();

      // Act
      const diff = merger.calculateDiff(
        localWithoutPuzzles,
        incomingWithPuzzles,
      );

      // Assert
      expect(diff.hasDifferences).toBe(true);
      expect(diff.hasUpgrades).toBe(true);
      expect(diff.puzzles.localRating).toBe(800);
      expect(diff.puzzles.incomingRating).toBe(1300);
      expect(diff.puzzles.localSolvedCount).toBe(0);
      expect(diff.puzzles.incomingSolvedCount).toBe(2);
    });

    it("safely calculates diff when incoming is missing puzzles without throwing", () => {
      // Arrange
      const localWithPuzzles = createLocalPayload();
      const incomingWithoutPuzzles = {
        version: 1,
        exportedAt: 1700001000000,
        scenarios: {},
      } as unknown as UnifiedProgressPayload;

      // Act
      const diff = merger.calculateDiff(
        localWithPuzzles,
        incomingWithoutPuzzles,
      );

      // Assert
      expect(diff.hasDifferences).toBe(true);
      expect(diff.puzzles.localRating).toBe(1100);
      expect(diff.puzzles.incomingRating).toBe(800);
      expect(diff.puzzles.localSolvedCount).toBe(1);
      expect(diff.puzzles.incomingSolvedCount).toBe(0);
    });
  });

  describe("Functional Export Helpers", () => {
    it("provides functional helpers mergeUnifiedProgress and calculateProgressDiff", () => {
      // Arrange
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      // Act
      const merged = mergeUnifiedProgress(local, incoming, "smart_merge");
      const diff = calculateProgressDiff(local, incoming);

      // Assert
      expect(merged.puzzles.ratingProfile.rating).toBe(1300);
      expect(diff.hasUpgrades).toBe(true);
    });
  });
});
