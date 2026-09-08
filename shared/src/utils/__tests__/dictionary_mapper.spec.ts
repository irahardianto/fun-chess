import { describe, it, expect } from "vitest";
import type {
  UnifiedProgressPayload,
  CompactProgressDto,
} from "../../types/progress_sync.js";
import {
  DefaultDictionaryMapper,
  defaultDictionaryMapper,
  toCompactProgress,
  fromCompactProgress,
} from "../dictionary_mapper.js";

describe("Dictionary Mapper (Compact DTO Tokenization & Reconstitution)", () => {
  const mapper = defaultDictionaryMapper ?? new DefaultDictionaryMapper();

  const createFullPayload = (
    overrides?: Partial<UnifiedProgressPayload>,
  ): UnifiedProgressPayload => ({
    version: 1,
    exportedAt: 1700000000000,
    clientVersion: "1.0.0",
    scenarios: {
      "lesson-1": {
        scenarioId: "lesson-1",
        starsEarned: 3,
        attemptsCount: 2,
        hintsUsedTotal: 1,
        firstCompletedAt: 1699999000000,
        lastCompletedAt: 1700000000000,
      },
      "lesson-2": {
        scenarioId: "lesson-2",
        starsEarned: 2,
        attemptsCount: 4,
        hintsUsedTotal: 2,
        firstCompletedAt: 1699995000000,
        lastCompletedAt: 1699998000000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: 1250,
        ratingDeviation: 85,
        peakRating: 1300,
        totalAttempted: 40,
        totalSolved: 32,
        bestStreak: 12,
        ratingHistory: [],
      },
      themeMastery: {
        fork: {
          theme: "fork",
          attempted: 25,
          solved: 22,
          starsEarned: 40,
          masteryLevel: "master",
          lastPracticedAt: 1699990000000,
        },
        pin: {
          theme: "pin",
          attempted: 12,
          solved: 10,
          starsEarned: 18,
          masteryLevel: "apprentice",
          lastPracticedAt: 1699992000000,
        },
        skewer: {
          theme: "skewer",
          attempted: 6,
          solved: 4,
          starsEarned: 7,
          masteryLevel: "novice",
          lastPracticedAt: 1699994000000,
        },
      },
      arcadeStats: {
        puzzleRushHighScore: 24,
        puzzleRushBestStreak: 8,
        streakSurvivorHighScore: 19,
        totalRushRuns: 14,
      },
      solvedPuzzles: {
        puz_fork_001: {
          stars: 3,
          solvedAt: 1699991000000,
        },
        puz_pin_002: {
          stars: 2,
          solvedAt: 1699993000000,
        },
      },
      createdAt: 1699000000000,
      lastActiveAt: 1700000000000,
    },
    ...overrides,
  });

  describe("Round-Trip Fidelity", () => {
    it("accurately preserves and recovers all domain fields across toCompact -> fromCompact cycle", () => {
      // Arrange
      const original = createFullPayload();

      // Act
      const compact = mapper.toCompact(original);
      const restored = mapper.fromCompact(compact);

      // Assert
      expect(restored.version).toBe(original.version);
      expect(restored.clientVersion).toBe(original.clientVersion);
      expect(restored.exportedAt).toBe(original.exportedAt);

      // Scenarios check
      expect(Object.keys(restored.scenarios)).toHaveLength(2);
      expect(restored.scenarios["lesson-1"]).toEqual({
        scenarioId: "lesson-1",
        starsEarned: 3,
        attemptsCount: 2,
        hintsUsedTotal: 1,
        firstCompletedAt: 1699999000000,
        lastCompletedAt: 1700000000000,
      });
      expect(restored.scenarios["lesson-2"]?.starsEarned).toBe(2);

      // Rating profile check
      expect(restored.puzzles.ratingProfile.rating).toBe(1250);
      expect(restored.puzzles.ratingProfile.ratingDeviation).toBe(85);
      expect(restored.puzzles.ratingProfile.peakRating).toBe(1300);
      expect(restored.puzzles.ratingProfile.totalAttempted).toBe(40);
      expect(restored.puzzles.ratingProfile.totalSolved).toBe(32);
      expect(restored.puzzles.ratingProfile.bestStreak).toBe(12);

      // Theme mastery check
      expect(restored.puzzles.themeMastery.fork?.masteryLevel).toBe("master");
      expect(restored.puzzles.themeMastery.fork?.starsEarned).toBe(40);
      expect(restored.puzzles.themeMastery.fork?.solved).toBe(22);
      expect(restored.puzzles.themeMastery.pin?.masteryLevel).toBe(
        "apprentice",
      );
      expect(restored.puzzles.themeMastery.pin?.starsEarned).toBe(18);
      expect(restored.puzzles.themeMastery.pin?.solved).toBe(10);
      expect(restored.puzzles.themeMastery.skewer?.masteryLevel).toBe("novice");
      expect(restored.puzzles.themeMastery.skewer?.starsEarned).toBe(7);
      expect(restored.puzzles.themeMastery.skewer?.solved).toBe(4);

      // Solved puzzles check
      expect(restored.puzzles.solvedPuzzles.puz_fork_001?.stars).toBe(3);
      expect(restored.puzzles.solvedPuzzles.puz_pin_002?.stars).toBe(2);

      // Arcade stats check
      expect(restored.puzzles.arcadeStats.puzzleRushHighScore).toBe(24);
      expect(restored.puzzles.arcadeStats.puzzleRushBestStreak).toBe(8);
      expect(restored.puzzles.arcadeStats.streakSurvivorHighScore).toBe(19);
      expect(restored.puzzles.arcadeStats.totalRushRuns).toBe(14);

      // Profile timestamps check
      expect(restored.puzzles.createdAt).toBe(1699000000000);
      expect(restored.puzzles.lastActiveAt).toBe(1700000000000);
    });

    it("works identically using functional helpers toCompactProgress and fromCompactProgress", () => {
      // Arrange
      const original = createFullPayload();

      // Act
      const compact = toCompactProgress(original);
      const restored = fromCompactProgress(compact);

      // Assert
      expect(restored.version).toBe(original.version);
      expect(restored.puzzles.ratingProfile.rating).toBe(1250);
      expect(restored.scenarios["lesson-1"]?.starsEarned).toBe(3);
    });
  });

  describe("Timestamp Granularity Handling", () => {
    it("converts millisecond timestamps to second granularity in compact representation and restores to ms", () => {
      // Arrange: millisecond timestamps with sub-second values (e.g. 1700000123456 ms)
      const input: UnifiedProgressPayload = createFullPayload({
        exportedAt: 1700000123456,
        scenarios: {
          "subsecond-sc": {
            scenarioId: "subsecond-sc",
            starsEarned: 3,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 1700000222888,
            lastCompletedAt: 1700000333999,
          },
        },
      });

      // Act
      const compact = mapper.toCompact(input);
      const restored = mapper.fromCompact(compact);

      // Assert
      // In compact DTO, timestamps are integer unix seconds
      expect(compact.t).toBe(1700000123);
      const scTuple = compact.sc.find(([id]) => id === "subsecond-sc");
      expect(scTuple).toBeDefined();
      expect(scTuple?.[4]).toBe(1700000222); // firstCompletedSec
      expect(scTuple?.[5]).toBe(1700000333); // lastCompletedSec

      // In restored domain object, timestamps are converted back to epoch ms (multiplied by 1000)
      expect(restored.exportedAt).toBe(1700000123000);
      expect(restored.scenarios["subsecond-sc"]?.firstCompletedAt).toBe(
        1700000222000,
      );
      expect(restored.scenarios["subsecond-sc"]?.lastCompletedAt).toBe(
        1700000333000,
      );
    });
  });

  describe("Theme Mastery Level Recalculation", () => {
    it("assigns master level for solved count >= 20 on fromCompact", () => {
      // Arrange
      const compact = mapper.toCompact(
        createFullPayload({
          puzzles: {
            ...createFullPayload().puzzles,
            themeMastery: {
              fork: {
                theme: "fork",
                attempted: 25,
                solved: 20,
                starsEarned: 35,
                masteryLevel: "novice", // Will be recalculated to master
                lastPracticedAt: 1700000000000,
              },
            },
          },
        }),
      );

      // Act
      const restored = mapper.fromCompact(compact);

      // Assert
      expect(restored.puzzles.themeMastery.fork?.masteryLevel).toBe("master");
    });

    it("assigns apprentice level for solved count >= 8 and < 20 on fromCompact", () => {
      // Arrange
      const compact = mapper.toCompact(
        createFullPayload({
          puzzles: {
            ...createFullPayload().puzzles,
            themeMastery: {
              pin8: {
                theme: "pin",
                attempted: 10,
                solved: 8,
                starsEarned: 12,
                masteryLevel: "novice",
                lastPracticedAt: 1700000000000,
              },
              pin19: {
                theme: "pin",
                attempted: 20,
                solved: 19,
                starsEarned: 30,
                masteryLevel: "novice",
                lastPracticedAt: 1700000000000,
              },
            },
          },
        }),
      );

      // Act
      const restored = mapper.fromCompact(compact);

      // Assert
      expect(restored.puzzles.themeMastery.pin8?.masteryLevel).toBe(
        "apprentice",
      );
      expect(restored.puzzles.themeMastery.pin19?.masteryLevel).toBe(
        "apprentice",
      );
    });

    it("assigns novice level for solved count < 8 on fromCompact", () => {
      // Arrange
      const compact = mapper.toCompact(
        createFullPayload({
          puzzles: {
            ...createFullPayload().puzzles,
            themeMastery: {
              skewer: {
                theme: "skewer",
                attempted: 6,
                solved: 7,
                starsEarned: 10,
                masteryLevel: "master", // Incorrect on input, should correct to novice because solved < 8
                lastPracticedAt: 1700000000000,
              },
            },
          },
        }),
      );

      // Act
      const restored = mapper.fromCompact(compact);

      // Assert
      expect(restored.puzzles.themeMastery.skewer?.masteryLevel).toBe("novice");
    });
  });

  describe("Handling Empty and Sparse Payloads", () => {
    it("handles empty scenarios, empty solvedPuzzles, and empty themeMastery cleanly", () => {
      // Arrange
      const emptyPayload: UnifiedProgressPayload = {
        version: 1,
        exportedAt: 1700000000000,
        scenarios: {},
        puzzles: {
          ratingProfile: {
            rating: 800,
            ratingDeviation: 350,
            peakRating: 800,
            totalAttempted: 0,
            totalSolved: 0,
            bestStreak: 0,
            ratingHistory: [],
          },
          themeMastery: {},
          arcadeStats: {
            puzzleRushHighScore: 0,
            puzzleRushBestStreak: 0,
            streakSurvivorHighScore: 0,
            totalRushRuns: 0,
          },
          solvedPuzzles: {},
          createdAt: 1700000000000,
          lastActiveAt: 1700000000000,
        },
      };

      // Act
      const compact = mapper.toCompact(emptyPayload);
      const restored = mapper.fromCompact(compact);

      // Assert
      expect(compact.sc).toEqual([]);
      expect(compact.pz.tm).toEqual([]);
      expect(compact.pz.sp).toEqual([]);

      expect(restored.scenarios).toEqual({});
      expect(restored.puzzles.solvedPuzzles).toEqual({});
      expect(restored.puzzles.themeMastery).toEqual({});
      expect(restored.puzzles.ratingProfile.rating).toBe(800);
      expect(restored.puzzles.ratingProfile.ratingDeviation).toBe(350);
    });

    it("instantiates custom DefaultDictionaryMapper class independently", () => {
      // Arrange
      const customMapper = new DefaultDictionaryMapper();
      const payload = createFullPayload();

      // Act
      const compact = customMapper.toCompact(payload);
      const restored = customMapper.fromCompact(compact);

      // Assert
      expect(compact.v).toBe(1);
      expect(restored.version).toBe(1);
    });
  });

  describe("Decomposed Sub-Mappers & Robust fromCompact Handling (MIN-025)", () => {
    it("preserves 100% fidelity across all decomposed sub-mappers with a full valid CompactProgressDto", () => {
      const compactDto: CompactProgressDto = {
        v: 1,
        t: 1700000000,
        c: "1.2.0",
        sc: [
          ["tactics-fork-1", 3, 2, 0, 1699990000, 1700000000],
          ["mate-in-one", 2, 4, 1, 1699991000, 1699995000],
        ],
        pz: {
          r: [1450, 95, 1500, 50, 42, 15],
          tm: [
            ["fork", 30, 25, 50, 1700000000],
            ["pin", 15, 10, 20, 1699999000],
          ],
          ac: [28, 10, 15, 20],
          sp: [
            ["puz_101", 3, 1699990000],
            ["puz_102", 2, 1699991000],
          ],
          ca: 1699000000,
          la: 1700000000,
        },
      };

      const restored = mapper.fromCompact(compactDto);

      // Verify header fields
      expect(restored.version).toBe(1);
      expect(restored.exportedAt).toBe(1700000000000);
      expect(restored.clientVersion).toBe("1.2.0");

      // Verify restoreScenarios sub-mapper
      expect(Object.keys(restored.scenarios)).toHaveLength(2);
      expect(restored.scenarios["tactics-fork-1"]).toEqual({
        scenarioId: "tactics-fork-1",
        starsEarned: 3,
        attemptsCount: 2,
        hintsUsedTotal: 0,
        firstCompletedAt: 1699990000000,
        lastCompletedAt: 1700000000000,
      });

      // Verify restoreRatingProfile sub-mapper
      expect(restored.puzzles.ratingProfile).toEqual({
        rating: 1450,
        ratingDeviation: 95,
        peakRating: 1500,
        totalAttempted: 50,
        totalSolved: 42,
        bestStreak: 15,
        ratingHistory: [],
      });

      // Verify restoreThemeMastery sub-mapper
      expect(restored.puzzles.themeMastery["fork"]).toEqual({
        theme: "fork",
        attempted: 30,
        solved: 25,
        starsEarned: 50,
        masteryLevel: "master",
        lastPracticedAt: 1700000000000,
      });
      expect(restored.puzzles.themeMastery["pin"]?.masteryLevel).toBe("apprentice");

      // Verify restoreArcadeStats sub-mapper
      expect(restored.puzzles.arcadeStats).toEqual({
        puzzleRushHighScore: 28,
        puzzleRushBestStreak: 10,
        streakSurvivorHighScore: 15,
        totalRushRuns: 20,
      });

      // Verify restoreSolvedPuzzles sub-mapper
      expect(restored.puzzles.solvedPuzzles["puz_101"]).toEqual({
        stars: 3,
        solvedAt: 1699990000000,
      });
      expect(restored.puzzles.solvedPuzzles["puz_102"]).toEqual({
        stars: 2,
        solvedAt: 1699991000000,
      });
    });

    it("handles partial CompactProgressDto inputs with missing or sparse sub-trees", () => {
      // Partial payload: missing sc and missing pz
      const partialNoScOrPz = {
        v: 1,
        t: 1700000000,
        c: "1.0.0",
      } as unknown as CompactProgressDto;

      const restored1 = mapper.fromCompact(partialNoScOrPz);
      expect(restored1.scenarios).toEqual({});
      expect(restored1.puzzles.ratingProfile.rating).toBe(800);
      expect(restored1.puzzles.ratingProfile.ratingDeviation).toBe(350);
      expect(restored1.puzzles.themeMastery).toEqual({});
      expect(restored1.puzzles.arcadeStats.puzzleRushHighScore).toBe(0);
      expect(restored1.puzzles.solvedPuzzles).toEqual({});

      // Partial payload: pz present but all inner sub-arrays undefined
      const partialEmptyPz = {
        v: 1,
        t: 1700000000,
        pz: {},
      } as unknown as CompactProgressDto;

      const restored2 = mapper.fromCompact(partialEmptyPz);
      expect(restored2.scenarios).toEqual({});
      expect(restored2.puzzles.ratingProfile.rating).toBe(800);
      expect(restored2.puzzles.themeMastery).toEqual({});
      expect(restored2.puzzles.arcadeStats.totalRushRuns).toBe(0);
      expect(restored2.puzzles.solvedPuzzles).toEqual({});
    });

    it("handles empty CompactProgressDto inputs gracefully reconstructing safe defaults", () => {
      const emptyDto = {} as unknown as CompactProgressDto;
      const restored = mapper.fromCompact(emptyDto);

      expect(restored.version).toBe(1);
      expect(restored.exportedAt).toBeGreaterThan(0);
      expect(restored.scenarios).toEqual({});
      expect(restored.puzzles.ratingProfile.rating).toBe(800);
      expect(restored.puzzles.ratingProfile.ratingDeviation).toBe(350);
      expect(restored.puzzles.ratingProfile.peakRating).toBe(800);
      expect(restored.puzzles.themeMastery).toEqual({});
      expect(restored.puzzles.arcadeStats).toEqual({
        puzzleRushHighScore: 0,
        puzzleRushBestStreak: 0,
        streakSurvivorHighScore: 0,
        totalRushRuns: 0,
      });
      expect(restored.puzzles.solvedPuzzles).toEqual({});
    });

    it("defensively discards malformed and truncated tuples within sub-mappers", () => {
      const corruptedDto = {
        v: 1,
        t: 1700000000,
        sc: [
          ["too-short", 3], // invalid tuple length < 6
          [null, 3, 1, 0, 1700000000, 1700000000], // invalid id
          ["valid-sc", 3, 1, 0, 1700000000, 1700000000], // valid
        ],
        pz: {
          r: [1200, 100, 1250, 10, 8, 3],
          tm: [
            ["too-short"], // invalid tuple length < 5
            ["", 10, 8, 10, 1700000000], // empty theme name
            ["fork", 10, 8, 10, 1700000000], // valid
          ],
          ac: [10, 5, 8, 3],
          sp: [
            ["too-short"], // invalid tuple length < 3
            ["", 3, 1700000000], // empty puzzle id
            ["puz_valid", 3, 1700000000], // valid
          ],
          ca: 1700000000,
          la: 1700000000,
        },
      } as unknown as CompactProgressDto;

      const restored = mapper.fromCompact(corruptedDto);
      expect(Object.keys(restored.scenarios)).toEqual(["valid-sc"]);
      expect(Object.keys(restored.puzzles.themeMastery)).toEqual(["fork"]);
      expect(Object.keys(restored.puzzles.solvedPuzzles)).toEqual(["puz_valid"]);
    });
  });

  describe("Deterministic Time Parameter (MAJ-013)", () => {
    it("produces strictly identical compact outputs across repeated calls when given explicit now: number", () => {
      const payload = createFullPayload({ exportedAt: 0 });
      const fixedNow = 1750000000000;

      const run1 = mapper.toCompact(payload, fixedNow);
      const run2 = mapper.toCompact(payload, fixedNow);

      expect(run1).toEqual(run2);
      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
      expect(run1.t).toBe(1750000000);
    });

    it("propagates explicit now: number via toCompactProgress and fromCompactProgress helpers", () => {
      const payload = createFullPayload({ exportedAt: 0 });
      const fixedNow = 1800000000000;

      const compact = toCompactProgress(payload, fixedNow);
      expect(compact.t).toBe(1800000000);

      const compactWithoutT = { ...compact, t: 0 };
      const restored = fromCompactProgress(compactWithoutT, fixedNow);
      expect(restored.exportedAt).toBe(1800000000000);
    });
  });
});

