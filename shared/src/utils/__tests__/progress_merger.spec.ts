import { describe, it, expect } from "vitest";
import type { UnifiedProgressPayload } from "../../types/progress_sync.js";
import type { PuzzleTheme } from "../../contracts/puzzle.js";
import {
  DefaultProgressMergeEngine,
  defaultProgressMergeEngine,
  mergeUnifiedProgress,
  calculateProgressDiff,
  diffAcademyProgress,
  diffScenarios,
  diffPuzzleProgress,
  diffArcadeProgress,
  diffMetadataProgress,
  detectProgressDiffFlags,
} from "../progress_merger.js";

describe("Progress Merger (Pure Mathematical Smart Merge & Diff Engine)", () => {
  const merger = defaultProgressMergeEngine ?? new DefaultProgressMergeEngine();

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

    it("applies clock skew tolerance buffer when determining isIncomingNewer (ENH-015)", () => {
      const local = createLocalPayload();
      const localExportedAt = 1700000000000;
      const localLastActiveAt = 1700000000000;

      const baseLocal = {
        ...local,
        exportedAt: localExportedAt,
        puzzles: {
          ...local.puzzles,
          lastActiveAt: localLastActiveAt,
        },
      };

      // 1. When incoming is 30s ahead of local: within 60s tolerance buffer -> isIncomingNewer is false
      const incoming30sAhead = {
        ...createIncomingPayload(),
        exportedAt: localExportedAt + 30_000,
        puzzles: {
          ...createIncomingPayload().puzzles,
          lastActiveAt: localLastActiveAt + 30_000,
        },
      };
      const diff30s = calculateProgressDiff(baseLocal, incoming30sAhead);
      expect(diff30s.metadata.isIncomingNewer).toBe(false);

      // 2. When incoming is 120s ahead of local: exceeds 60s tolerance buffer -> isIncomingNewer is true
      const incoming120sAhead = {
        ...createIncomingPayload(),
        exportedAt: localExportedAt + 120_000,
        puzzles: {
          ...createIncomingPayload().puzzles,
          lastActiveAt: localLastActiveAt + 120_000,
        },
      };
      const diff120s = calculateProgressDiff(baseLocal, incoming120sAhead);
      expect(diff120s.metadata.isIncomingNewer).toBe(true);
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

    it("respects explicit now timestamp parameter instead of calling Date.now() (MAJ-018)", () => {
      const local = createLocalPayload();
      const incoming = createIncomingPayload();
      const explicitTimestamp = 1750000000000;

      const merged = mergeUnifiedProgress(
        local,
        incoming,
        "smart_merge",
        explicitTimestamp,
      );

      expect(merged.exportedAt).toBe(explicitTimestamp);
      expect(merged.puzzles.lastActiveAt).toBe(explicitTimestamp);
    });
  });

  describe("Dictionary Lookups & Prototype Safety (MAJ-003)", () => {
    it("uses Object.create(null) so prototype keys like toString or __proto__ do not collide with Object.prototype", () => {
      const localWithProtoKeys = {
        ...createLocalPayload(),
        scenarios: {
          toString: {
            scenarioId: "toString",
            starsEarned: 2,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 1700000000000,
            lastCompletedAt: 1700000000000,
          },
        },
        puzzles: {
          ...createLocalPayload().puzzles,
          themeMastery: {
            toString: {
              theme: "fork" as PuzzleTheme,
              attempted: 5,
              solved: 3,
              starsEarned: 5,
              masteryLevel: "novice" as const,
              lastPracticedAt: 1700000000000,
            },
          },
          solvedPuzzles: {
            toString: {
              stars: 2 as const,
              solvedAt: 1700000000000,
            },
          },
        },
      };

      const incomingWithProtoKeys = {
        ...createIncomingPayload(),
        scenarios: {
          toString: {
            scenarioId: "toString",
            starsEarned: 3,
            attemptsCount: 2,
            hintsUsedTotal: 1,
            firstCompletedAt: 1699999000000,
            lastCompletedAt: 1700001000000,
          },
        },
        puzzles: {
          ...createIncomingPayload().puzzles,
          themeMastery: {
            toString: {
              theme: "fork" as PuzzleTheme,
              attempted: 10,
              solved: 8,
              starsEarned: 15,
              masteryLevel: "apprentice" as const,
              lastPracticedAt: 1700001000000,
            },
          },
          solvedPuzzles: {
            toString: {
              stars: 3 as const,
              solvedAt: 1700001000000,
            },
          },
        },
      };

      const merged = merger.merge(
        localWithProtoKeys,
        incomingWithProtoKeys,
        "smart_merge",
      );

      // Verify Object.prototype is unpolluted
      expect(Object.prototype.hasOwnProperty("scenarioId")).toBe(false);
      expect(Object.prototype.hasOwnProperty("starsEarned")).toBe(false);

      // Verify merged dictionary lookup works properly for prototype key names
      expect(merged.scenarios["toString"]?.starsEarned).toBe(3);
      expect(merged.puzzles.themeMastery["toString"]?.solved).toBe(11);
      expect(merged.puzzles.solvedPuzzles["toString"]?.stars).toBe(3);
    });
  });

  describe("Decomposed Sub-Diff Helpers (MIN-022)", () => {
    it("diffAcademyProgress (and diffScenarios alias) correctly computes scenario differences and star upgrades", () => {
      const local = createLocalPayload().scenarios;
      const incoming = createIncomingPayload().scenarios;

      const diff = diffAcademyProgress(local, incoming);
      expect(diff.localCompletedCount).toBe(2);
      expect(diff.incomingCompletedCount).toBe(2);
      expect(diff.mergedCompletedCount).toBe(3);
      expect(diff.newCompletedScenarios).toContain("lesson-3");
      expect(diff.starUpgrades).toEqual([
        { scenarioId: "lesson-1", fromStars: 2, toStars: 3 },
      ]);

      const aliasDiff = diffScenarios(local, incoming);
      expect(aliasDiff).toEqual(diff);
    });

    it("diffPuzzleProgress computes puzzle count and rating diffs", () => {
      const local = createLocalPayload().puzzles;
      const incoming = createIncomingPayload().puzzles;

      const diff = diffPuzzleProgress(local, incoming);
      expect(diff.localRating).toBe(1100);
      expect(diff.incomingRating).toBe(1300);
      expect(diff.mergedRating).toBe(1300);
      expect(diff.mergedPeakRating).toBe(1350);
      expect(diff.newPuzzlesSolvedCount).toBe(1);
    });

    it("diffArcadeProgress computes arcade mode score diffs", () => {
      const local = createLocalPayload().puzzles?.arcadeStats;
      const incoming = createIncomingPayload().puzzles?.arcadeStats;

      const diff = diffArcadeProgress(local, incoming);
      expect(diff.localRushHighScore).toBe(15);
      expect(diff.incomingRushHighScore).toBe(22);
      expect(diff.mergedRushHighScore).toBe(22);
      expect(diff.mergedSurvivorHighScore).toBe(10);
    });

    it("diffMetadataProgress assesses timestamp ordering and clock skew", () => {
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      const diff = diffMetadataProgress(local, incoming, 60_000);
      expect(diff.localLastActiveAt).toBe(1699995000000);
      expect(diff.incomingLastActiveAt).toBe(1700000000000);
      expect(diff.incomingExportedAt).toBe(1700001000000);
      expect(diff.isIncomingNewer).toBe(true); // 1700001000000 > 1700000000000 + 60_000

      // When skew tolerance is larger than difference (difference in lastActiveAt is 5,000,000ms):
      const diffBuffered = diffMetadataProgress(local, incoming, 10_000_000);
      expect(diffBuffered.isIncomingNewer).toBe(false);
    });

    it("detectProgressDiffFlags detects upgrade and difference presence", () => {
      const local = createLocalPayload();
      const incoming = createIncomingPayload();

      const academy = diffAcademyProgress(local.scenarios, incoming.scenarios);
      const puzzles = diffPuzzleProgress(local.puzzles, incoming.puzzles);
      const arcade = diffArcadeProgress(local.puzzles?.arcadeStats, incoming.puzzles?.arcadeStats);

      const flags = detectProgressDiffFlags(local, incoming, academy, puzzles, arcade);
      expect(flags.hasDifferences).toBe(true);
      expect(flags.hasUpgrades).toBe(true);
    });
  });

  describe("Deterministic Time Parameter (MAJ-013)", () => {
    it("uses explicit now: number for exportedAt and timestamps", () => {
      const local = createLocalPayload();
      const incoming = createIncomingPayload();
      const fixedNow = 1900000000000;

      const merged = mergeUnifiedProgress(local, incoming, "smart_merge", fixedNow);
      expect(merged.exportedAt).toBe(fixedNow);
      expect(merged.puzzles.lastActiveAt).toBe(fixedNow);
    });
  });
});

