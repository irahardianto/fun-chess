import { describe, it, expect } from "vitest";
import type {
  Puzzle,
  PuzzleTheme,
  PuzzleThemeCategory,
  PuzzleThemeDescriptor,
  PuzzleDifficultyTier,
  PuzzlePackMetadata,
  PuzzleBundle,
  HintLevel,
  HintTierName,
  HintData,
  PuzzleMode,
  PuzzleAttemptResult,
  BasePuzzleSessionState,
  ThemedDrillsSessionState,
  AdaptiveLadderSessionState,
  PuzzleRushSessionState,
  StreakSurvivorSessionState,
  PuzzleSessionState,
  AdaptiveRatingState,
  ThemeMasteryProgress,
  PuzzleArcadeStats,
  PuzzleProgress,
  PuzzleProgressStore,
  PlayerMoveAction,
  MoveValidationOutcome,
  PuzzleEngineService,
  RatingAdjustmentParams,
  RatingAdjustmentResult,
  AdaptiveRatingCalculator,
  RushTickResult,
  RushSolveResult,
  RushStrikeResult,
  PuzzleRushRules,
  PuzzleErrorCode,
  PuzzleErrorPayload,
  StarRating,
} from "../index.js";

describe("Gamified Puzzle Hub Contracts & Models", () => {
  describe("Taxonomy & Union Types", () => {
    it("validates all 5 domains of PuzzleTheme", () => {
      const fundamentalTactics: PuzzleTheme[] = [
        "fork",
        "pin",
        "skewer",
        "discovered_attack",
        "discovered_check",
        "double_check",
        "hanging_piece",
        "trapped_piece",
      ];

      const intermediateTactics: PuzzleTheme[] = [
        "captures_checks_threats",
        "knight_outpost",
        "cross_pin",
        "battery",
        "deflection",
        "decoy",
        "interference",
        "clearance",
        "greek_gift",
        "windmill",
        "zwischenzug",
        "desperado",
        "overloaded_piece",
        "x_ray_attack",
      ];

      const checkmateFamilies: PuzzleTheme[] = [
        "mate_in_1",
        "mate_in_2",
        "mate_in_3",
        "back_rank_mate",
        "scholars_mate",
        "smothered_mate",
        "anastasia_mate",
        "arabian_mate",
        "hook_mate",
        "vukovic_mate",
        "boden_mate",
        "balestra_mate",
        "blackburne_mate",
        "lolli_mate",
        "damiano_mate",
        "kill_box_mate",
        "railroad_mate",
        "blind_swine_mate",
        "dovetail_mate",
      ];

      const endgameConversions: PuzzleTheme[] = [
        "pawn_endgame",
        "rook_endgame",
        "queen_endgame",
        "minor_piece_endgame",
        "lucena_position",
        "philidor_defense",
        "two_bishops_mate",
      ];

      const openingTraps: PuzzleTheme[] = [
        "legals_trap",
        "fried_liver",
        "noahs_ark_trap",
        "fools_mate",
      ];

      expect(fundamentalTactics).toHaveLength(8);
      expect(intermediateTactics).toHaveLength(14);
      expect(checkmateFamilies).toHaveLength(19);
      expect(endgameConversions).toHaveLength(7);
      expect(openingTraps).toHaveLength(4);

      const allThemes: PuzzleTheme[] = [
        ...fundamentalTactics,
        ...intermediateTactics,
        ...checkmateFamilies,
        ...endgameConversions,
        ...openingTraps,
      ];
      expect(allThemes).toHaveLength(52);
    });

    it("validates PuzzleThemeCategory values", () => {
      const categories: PuzzleThemeCategory[] = [
        "basic_tactics",
        "advanced_tactics",
        "checkmate_patterns",
        "endgame_technique",
        "opening_traps",
      ];
      expect(categories).toHaveLength(5);
      expect(categories).toContain("basic_tactics");
      expect(categories).toContain("advanced_tactics");
    });

    it("validates PuzzleDifficultyTier calibrations", () => {
      const tiers: PuzzleDifficultyTier[] = [
        "novice",
        "easy",
        "medium",
        "hard",
        "expert",
      ];
      expect(tiers).toHaveLength(5);
      expect(tiers).toEqual(["novice", "easy", "medium", "hard", "expert"]);
    });

    it("validates PuzzleMode and PuzzleAttemptResult unions", () => {
      const modes: PuzzleMode[] = [
        "themed_drills",
        "adaptive_ladder",
        "puzzle_rush",
        "streak_survivor",
      ];
      const results: PuzzleAttemptResult[] = [
        "unsolved",
        "solved_first_try",
        "solved_with_hints",
        "solved_with_retries",
        "failed",
      ];

      expect(modes).toHaveLength(4);
      expect(results).toHaveLength(5);
      expect(modes).toContain("puzzle_rush");
      expect(results).toContain("solved_first_try");
    });

    it("validates 3-tier HintLevel and HintTierName values", () => {
      const levels: HintLevel[] = [0, 1, 2, 3];
      const tierNames: HintTierName[] = [
        "none",
        "piece_nudge",
        "target_glow",
        "full_solution",
      ];

      expect(levels).toEqual([0, 1, 2, 3]);
      expect(tierNames).toHaveLength(4);
      expect(tierNames).toContain("piece_nudge");
      expect(tierNames).toContain("target_glow");
      expect(tierNames).toContain("full_solution");
    });

    it("validates PuzzleErrorCode enumeration completeness", () => {
      const errorCodes: PuzzleErrorCode[] = [
        "ERR_PUZZLE_NOT_FOUND",
        "ERR_INVALID_PUZZLE_FEN",
        "ERR_MALFORMED_SOLUTION_LINE",
        "ERR_STORAGE_UNAVAILABLE",
        "ERR_STORAGE_PARSE_FAILED",
        "ERR_INVALID_THEME",
        "ERR_RUSH_ALREADY_FINISHED",
      ];

      expect(errorCodes).toHaveLength(7);
      expect(errorCodes).toContain("ERR_PUZZLE_NOT_FOUND");
      expect(errorCodes).toContain("ERR_INVALID_THEME");
    });
  });

  describe("Entity & Bundle Models", () => {
    it("constructs a valid Puzzle model with tactical motifs", () => {
      const puzzle: Puzzle = {
        id: "puz_fork_001",
        fen: "r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4",
        moves: ["f3f7"],
        rating: 700,
        ratingDeviation: 110,
        themes: ["mate_in_1", "scholars_mate"],
        primaryTheme: "mate_in_1",
        difficulty: "novice",
        title: "Scholar's Mate Finish! 👑",
        subtitle: "Deliver checkmate on the weak f7 square",
        playerColor: "w",
        solutionPlies: 1,
      };

      expect(puzzle.id).toBe("puz_fork_001");
      expect(puzzle.rating).toBe(700);
      expect(puzzle.difficulty).toBe("novice");
      expect(puzzle.themes).toContain("mate_in_1");
      expect(puzzle.playerColor).toBe("w");
      expect(puzzle.solutionPlies).toBe(1);
    });

    it("constructs a multi-ply Puzzle model with opponent counter-move", () => {
      const multiPlyPuzzle: Puzzle = {
        id: "puz_greek_gift_042",
        fen: "r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 6",
        moves: ["f1d3", "d5c4", "d3h7"],
        rating: 1550,
        ratingDeviation: 95,
        themes: ["greek_gift", "clearance", "battery"],
        primaryTheme: "greek_gift",
        difficulty: "hard",
        title: "The Classic Greek Gift Sacrifice! 🎁",
        subtitle: "Sacrifice the Bishop on h7 to tear open the Black King!",
        playerColor: "w",
        solutionPlies: 3,
      };

      expect(multiPlyPuzzle.rating).toBe(1550);
      expect(multiPlyPuzzle.difficulty).toBe("hard");
      expect(multiPlyPuzzle.moves).toHaveLength(3);
      expect(multiPlyPuzzle.primaryTheme).toBe("greek_gift");
    });

    it("constructs a PuzzleThemeDescriptor for UI rendering", () => {
      const descriptor: PuzzleThemeDescriptor = {
        id: "fork",
        category: "basic_tactics",
        name: "Royal Knight Forks",
        icon: "🍴",
        description: "One piece attacks two enemy pieces at the same time!",
        kidFriendlyTip:
          "Look for pieces standing on the same color diagonals or L-shapes!",
        estimatedRatingRange: [600, 1100],
      };

      expect(descriptor.id).toBe("fork");
      expect(descriptor.category).toBe("basic_tactics");
      expect(descriptor.icon).toBe("🍴");
      expect(descriptor.estimatedRatingRange).toEqual([600, 1100]);
    });

    it("constructs a PuzzleBundle with metadata header", () => {
      const samplePuzzle: Puzzle = {
        id: "puz_pin_001",
        fen: "4k3/8/8/4r3/8/8/4R3/4K3 w - - 0 1",
        moves: ["e2e5"],
        rating: 850,
        ratingDeviation: 120,
        themes: ["pin", "hanging_piece"],
        primaryTheme: "pin",
        difficulty: "novice",
        title: "Absolute Pin Capture! 📌",
        playerColor: "w",
        solutionPlies: 1,
      };

      const metadata: PuzzlePackMetadata = {
        version: "2.0.0",
        generatedAt: "2026-08-26T00:00:00Z",
        totalPuzzles: 1,
        themeDistribution: { pin: 1 },
        ratingDistribution: {
          novice: 1,
          easy: 0,
          medium: 0,
          hard: 0,
          expert: 0,
        },
      };

      const bundle: PuzzleBundle = {
        metadata,
        puzzles: [samplePuzzle],
      };

      expect(bundle.metadata.version).toBe("2.0.0");
      expect(bundle.metadata.totalPuzzles).toBe(1);
      expect(bundle.puzzles[0]?.id).toBe("puz_pin_001");
    });
  });

  describe("3-Tier Progressive Hint Payloads", () => {
    it("constructs Tier 1 piece nudge hint", () => {
      const tier1: HintData = {
        level: 1,
        tier: "piece_nudge",
        sourceSquare: "c3",
        message: "Look closely at your Knight on c3! ♞",
        mascotDialogue: "Sniff sniff! Peanut sees a jump on c3! 🐶",
      };

      expect(tier1.level).toBe(1);
      expect(tier1.tier).toBe("piece_nudge");
      expect(tier1.sourceSquare).toBe("c3");
      expect(tier1.targetSquare).toBeUndefined();
      expect(tier1.solutionSan).toBeUndefined();
    });

    it("constructs Tier 2 target square glow hint", () => {
      const tier2: HintData = {
        level: 2,
        tier: "target_glow",
        sourceSquare: "c3",
        targetSquare: "d5",
        message: "Move your Knight to d5 to attack the Queen and King! 🎯",
        mascotDialogue: "Sparky says: Jump to d5 for a double attack! 🐿️",
      };

      expect(tier2.level).toBe(2);
      expect(tier2.tier).toBe("target_glow");
      expect(tier2.sourceSquare).toBe("c3");
      expect(tier2.targetSquare).toBe("d5");
      expect(tier2.solutionSan).toBeUndefined();
    });

    it("constructs Tier 3 full solution move arrow hint", () => {
      const tier3: HintData = {
        level: 3,
        tier: "full_solution",
        sourceSquare: "c3",
        targetSquare: "d5",
        message: "Play Nd5 to win the enemy Queen! 👑",
        solutionSan: "Nd5",
        solutionUci: "c3d5",
        mascotDialogue: "Fox reveals the golden path: Nd5! 🦊",
      };

      expect(tier3.level).toBe(3);
      expect(tier3.tier).toBe("full_solution");
      expect(tier3.sourceSquare).toBe("c3");
      expect(tier3.targetSquare).toBe("d5");
      expect(tier3.solutionSan).toBe("Nd5");
      expect(tier3.solutionUci).toBe("c3d5");
    });
  });

  describe("Session State Machine Contracts", () => {
    it("constructs ThemedDrillsSessionState", () => {
      const state: ThemedDrillsSessionState = {
        mode: "themed_drills",
        activeTheme: "fork",
        puzzlesSolvedInSession: 5,
        totalPuzzlesInTheme: 12,
        sessionAccuracyPercent: 83.3,
        currentPuzzle: null,
        currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        currentMoveIndex: 0,
        isPlayerTurn: true,
        isCompleted: false,
        isSolvedSuccessfully: false,
        attemptResult: "unsolved",
        currentHintLevel: 0,
        activeHint: null,
        mistakesCount: 0,
        selectedSquare: null,
        legalMoves: [],
        lastMove: null,
        isShaking: false,
        feedbackMessage: null,
      };

      expect(state.mode).toBe("themed_drills");
      expect(state.activeTheme).toBe("fork");
      expect(state.puzzlesSolvedInSession).toBe(5);
      expect(state.sessionAccuracyPercent).toBeCloseTo(83.3);
    });

    it("constructs AdaptiveLadderSessionState", () => {
      const state: AdaptiveLadderSessionState = {
        mode: "adaptive_ladder",
        currentRating: 1180,
        initialSessionRating: 1120,
        ratingDelta: 60,
        ratingConfidence: 140,
        streakCount: 4,
        bestStreakSession: 4,
        targetPuzzleRating: 1210,
        currentPuzzle: null,
        currentFen: "8/8/8/8/8/8/8/8 w - - 0 1",
        currentMoveIndex: 0,
        isPlayerTurn: true,
        isCompleted: false,
        isSolvedSuccessfully: false,
        attemptResult: "unsolved",
        currentHintLevel: 0,
        activeHint: null,
        mistakesCount: 0,
        selectedSquare: null,
        legalMoves: [],
        lastMove: null,
        isShaking: false,
        feedbackMessage: null,
      };

      expect(state.mode).toBe("adaptive_ladder");
      expect(state.currentRating).toBe(1180);
      expect(state.streakCount).toBe(4);
      expect(state.targetPuzzleRating).toBe(1210);
    });

    it("constructs PuzzleRushSessionState and StreakSurvivorSessionState", () => {
      const rushState: PuzzleRushSessionState = {
        mode: "puzzle_rush",
        timeRemainingSeconds: 145,
        initialTimeSeconds: 180,
        score: 8,
        strikes: 1,
        maxStrikes: 3,
        comboMultiplier: 2,
        currentStreak: 3,
        isTimerRunning: true,
        isGameOver: false,
        timeBonusEarnedSeconds: 5,
        currentPuzzle: null,
        currentFen: "8/8/8/8/8/8/8/8 w - - 0 1",
        currentMoveIndex: 0,
        isPlayerTurn: true,
        isCompleted: false,
        isSolvedSuccessfully: false,
        attemptResult: "unsolved",
        currentHintLevel: 0,
        activeHint: null,
        mistakesCount: 1,
        selectedSquare: null,
        legalMoves: [],
        lastMove: null,
        isShaking: false,
        feedbackMessage: null,
      };

      const survivorState: StreakSurvivorSessionState = {
        mode: "streak_survivor",
        livesRemaining: 2,
        maxLives: 3,
        currentStreak: 7,
        bestStreakAllTime: 12,
        score: 7,
        isGameOver: false,
        currentPuzzle: null,
        currentFen: "8/8/8/8/8/8/8/8 w - - 0 1",
        currentMoveIndex: 0,
        isPlayerTurn: true,
        isCompleted: false,
        isSolvedSuccessfully: false,
        attemptResult: "unsolved",
        currentHintLevel: 0,
        activeHint: null,
        mistakesCount: 1,
        selectedSquare: null,
        legalMoves: [],
        lastMove: null,
        isShaking: false,
        feedbackMessage: null,
      };

      expect(rushState.timeRemainingSeconds).toBe(145);
      expect(rushState.comboMultiplier).toBe(2);
      expect(survivorState.livesRemaining).toBe(2);
      expect(survivorState.bestStreakAllTime).toBe(12);
    });
  });

  describe("Progress Persistence & Store Contracts", () => {
    it("constructs a full PuzzleProgress object with theme mastery and rating profile", () => {
      const ratingProfile: AdaptiveRatingState = {
        rating: 1250,
        ratingDeviation: 130,
        peakRating: 1280,
        totalAttempted: 45,
        totalSolved: 38,
        bestStreak: 9,
        ratingHistory: [
          {
            timestamp: 1700000000000,
            rating: 1238,
            puzzleId: "puz_001",
            delta: 12,
          },
          {
            timestamp: 1700000010000,
            rating: 1250,
            puzzleId: "puz_002",
            delta: 12,
          },
        ],
      };

      const themeMastery: Record<string, ThemeMasteryProgress> = {
        fork: {
          theme: "fork",
          attempted: 15,
          solved: 14,
          starsEarned: 40,
          masteryLevel: "master",
          lastPracticedAt: 1700000000000,
        },
      };

      const arcadeStats: PuzzleArcadeStats = {
        puzzleRushHighScore: 21,
        puzzleRushBestStreak: 14,
        streakSurvivorHighScore: 18,
        totalRushRuns: 10,
      };

      const progress: PuzzleProgress = {
        ratingProfile,
        themeMastery,
        arcadeStats,
        solvedPuzzles: {
          puz_001: { stars: 3, solvedAt: 1700000000000 },
          puz_002: { stars: 2, solvedAt: 1700000010000 },
        },
        createdAt: 1700000000000,
        lastActiveAt: 1700000010000,
      };

      expect(progress.ratingProfile.rating).toBe(1250);
      expect(progress.themeMastery["fork"]?.masteryLevel).toBe("master");
      expect(progress.arcadeStats.puzzleRushHighScore).toBe(21);
      expect(progress.solvedPuzzles["puz_001"]?.stars).toBe(3);
    });

    it("implements PuzzleProgressStore interface with an in-memory mock", async () => {
      const initialRating: AdaptiveRatingState = {
        rating: 800,
        ratingDeviation: 350,
        peakRating: 800,
        totalAttempted: 0,
        totalSolved: 0,
        bestStreak: 0,
        ratingHistory: [],
      };

      let storedProgress: PuzzleProgress = {
        ratingProfile: initialRating,
        themeMastery: {},
        arcadeStats: {
          puzzleRushHighScore: 0,
          puzzleRushBestStreak: 0,
          streakSurvivorHighScore: 0,
          totalRushRuns: 0,
        },
        solvedPuzzles: {},
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };

      const mockStore: PuzzleProgressStore = {
        async getProgress() {
          return storedProgress;
        },
        async updateRating(newRatingState: AdaptiveRatingState) {
          storedProgress = {
            ...storedProgress,
            ratingProfile: newRatingState,
            lastActiveAt: Date.now(),
          };
        },
        async recordPuzzleAttempt(
          puzzleId: string,
          theme: PuzzleTheme,
          result: PuzzleAttemptResult,
          stars: StarRating,
        ) {
          const solved = result.startsWith("solved");
          const prevTheme = storedProgress.themeMastery[theme] || {
            theme,
            attempted: 0,
            solved: 0,
            starsEarned: 0,
            masteryLevel: "novice",
            lastPracticedAt: Date.now(),
          };

          const newSolvedCount = prevTheme.solved + (solved ? 1 : 0);
          const masteryLevel =
            newSolvedCount >= 20
              ? "master"
              : newSolvedCount >= 8
                ? "apprentice"
                : "novice";

          storedProgress = {
            ...storedProgress,
            themeMastery: {
              ...storedProgress.themeMastery,
              [theme]: {
                theme,
                attempted: prevTheme.attempted + 1,
                solved: newSolvedCount,
                starsEarned: prevTheme.starsEarned + (solved ? stars : 0),
                masteryLevel,
                lastPracticedAt: Date.now(),
              },
            },
            solvedPuzzles: solved
              ? {
                  ...storedProgress.solvedPuzzles,
                  [puzzleId]: { stars, solvedAt: Date.now() },
                }
              : storedProgress.solvedPuzzles,
            lastActiveAt: Date.now(),
          };
          return storedProgress;
        },
        async saveArcadeResult(
          mode: "puzzle_rush" | "streak_survivor",
          score: number,
          streak: number,
        ) {
          storedProgress = {
            ...storedProgress,
            arcadeStats: {
              ...storedProgress.arcadeStats,
              puzzleRushHighScore:
                mode === "puzzle_rush"
                  ? Math.max(
                      storedProgress.arcadeStats.puzzleRushHighScore,
                      score,
                    )
                  : storedProgress.arcadeStats.puzzleRushHighScore,
              puzzleRushBestStreak:
                mode === "puzzle_rush"
                  ? Math.max(
                      storedProgress.arcadeStats.puzzleRushBestStreak,
                      streak,
                    )
                  : storedProgress.arcadeStats.puzzleRushBestStreak,
              streakSurvivorHighScore:
                mode === "streak_survivor"
                  ? Math.max(
                      storedProgress.arcadeStats.streakSurvivorHighScore,
                      score,
                    )
                  : storedProgress.arcadeStats.streakSurvivorHighScore,
              totalRushRuns:
                mode === "puzzle_rush"
                  ? storedProgress.arcadeStats.totalRushRuns + 1
                  : storedProgress.arcadeStats.totalRushRuns,
            },
            lastActiveAt: Date.now(),
          };
          return storedProgress;
        },
        async resetAll() {
          storedProgress = {
            ratingProfile: initialRating,
            themeMastery: {},
            arcadeStats: {
              puzzleRushHighScore: 0,
              puzzleRushBestStreak: 0,
              streakSurvivorHighScore: 0,
              totalRushRuns: 0,
            },
            solvedPuzzles: {},
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
          };
        },
      };

      const initial = await mockStore.getProgress();
      expect(initial.ratingProfile.rating).toBe(800);

      const afterSolve = await mockStore.recordPuzzleAttempt(
        "puz_fork_001",
        "fork",
        "solved_first_try",
        3,
      );
      expect(afterSolve.solvedPuzzles["puz_fork_001"]?.stars).toBe(3);
      expect(afterSolve.themeMastery["fork"]?.solved).toBe(1);

      await mockStore.saveArcadeResult("puzzle_rush", 12, 8);
      const afterRush = await mockStore.getProgress();
      expect(afterRush.arcadeStats.puzzleRushHighScore).toBe(12);
      expect(afterRush.arcadeStats.totalRushRuns).toBe(1);

      await mockStore.resetAll();
      const resetProgress = await mockStore.getProgress();
      expect(resetProgress.arcadeStats.puzzleRushHighScore).toBe(0);
      expect(Object.keys(resetProgress.solvedPuzzles)).toHaveLength(0);
    });
  });

  describe("Engine & Rules Calculation Contracts", () => {
    it("validates PlayerMoveAction and MoveValidationOutcome", () => {
      const action: PlayerMoveAction = {
        from: "f3",
        to: "f7",
      };

      const outcome: MoveValidationOutcome = {
        isCorrect: true,
        isPuzzleComplete: true,
        nextFen:
          "r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
        nextMoveIndex: 1,
        feedback: "Checkmate! Beautiful tactical finish! 🏆",
      };

      expect(action.from).toBe("f3");
      expect(outcome.isCorrect).toBe(true);
      expect(outcome.isPuzzleComplete).toBe(true);
    });

    it("implements pure AdaptiveRatingCalculator contract", () => {
      const calculator: AdaptiveRatingCalculator = {
        calculateAdjustment(
          params: RatingAdjustmentParams,
        ): RatingAdjustmentResult {
          const exponent = (params.puzzleRating - params.playerRating) / 400;
          const expected = 1 / (1 + Math.pow(10, exponent));
          const actual = params.isSuccess ? 1 : 0;
          let delta = Math.round(32 * (actual - expected));

          if (params.isSuccess && params.hintsUsed > 0) {
            delta = Math.max(2, Math.round(delta * 0.5));
          }

          let streakBonus = 0;
          if (
            params.isSuccess &&
            params.hintsUsed === 0 &&
            params.currentStreak >= 3
          ) {
            streakBonus = Math.min(10, params.currentStreak * 2);
          }

          const target = params.playerRating + delta + streakBonus;
          const isProtectedByFloor = target < 500;
          const newRating = Math.max(500, target);
          const newRd = Math.max(80, Math.round(params.playerRd * 0.95));

          return {
            newRating,
            newRd,
            delta: newRating - params.playerRating,
            streakBonus,
            isProtectedByFloor,
          };
        },
        selectTargetPuzzleRating(
          currentRating: number,
          streak: number,
        ): number {
          if (streak >= 4) return currentRating + 60;
          if (streak <= -2) return Math.max(500, currentRating - 50);
          return Math.max(500, currentRating - 10);
        },
      };

      const resultWin = calculator.calculateAdjustment({
        playerRating: 1000,
        playerRd: 200,
        puzzleRating: 1000,
        isSuccess: true,
        hintsUsed: 0,
        currentStreak: 4,
      });

      expect(resultWin.delta).toBeGreaterThan(0);
      expect(resultWin.streakBonus).toBe(8);
      expect(resultWin.isProtectedByFloor).toBe(false);

      const floorTest = calculator.calculateAdjustment({
        playerRating: 505,
        playerRd: 200,
        puzzleRating: 400,
        isSuccess: false,
        hintsUsed: 0,
        currentStreak: 0,
      });

      expect(floorTest.newRating).toBe(500);
      expect(floorTest.isProtectedByFloor).toBe(true);

      const targetRating = calculator.selectTargetPuzzleRating(1000, 5);
      expect(targetRating).toBe(1060);
    });

    it("implements pure PuzzleRushRules contract", () => {
      const rushRules: PuzzleRushRules = {
        applySolve(
          currentScore: number,
          currentStreak: number,
          highScore: number,
          solveTimeMs: number,
        ): RushSolveResult {
          const newScore = currentScore + 1;
          const newStreak = currentStreak + 1;
          const comboMultiplier = newStreak >= 5 ? 3 : newStreak >= 3 ? 2 : 1;
          const timeBonusSeconds = solveTimeMs < 4000 && newStreak >= 3 ? 5 : 0;
          const isNewHighScore = newScore > highScore;

          return {
            newScore,
            newStreak,
            comboMultiplier,
            timeBonusSeconds,
            isNewHighScore,
          };
        },
        applyStrike(currentStrikes: number, maxStrikes = 3): RushStrikeResult {
          const newStrikes = currentStrikes + 1;
          return {
            newStrikes,
            isGameOver: newStrikes >= maxStrikes,
            comboReset: true,
          };
        },
        calculateTimeTick(
          currentSeconds: number,
          deltaSeconds: number,
        ): RushTickResult {
          const timeRemainingSeconds = Math.max(
            0,
            currentSeconds - deltaSeconds,
          );
          return {
            timeRemainingSeconds,
            isExpired: timeRemainingSeconds <= 0,
          };
        },
      };

      const solve1 = rushRules.applySolve(4, 2, 10, 2500);
      expect(solve1.newScore).toBe(5);
      expect(solve1.newStreak).toBe(3);
      expect(solve1.comboMultiplier).toBe(2);
      expect(solve1.timeBonusSeconds).toBe(5);
      expect(solve1.isNewHighScore).toBe(false);

      const strike1 = rushRules.applyStrike(2, 3);
      expect(strike1.newStrikes).toBe(3);
      expect(strike1.isGameOver).toBe(true);
      expect(strike1.comboReset).toBe(true);

      const tick1 = rushRules.calculateTimeTick(1, 1);
      expect(tick1.timeRemainingSeconds).toBe(0);
      expect(tick1.isExpired).toBe(true);
    });

    it("validates PuzzleErrorPayload structure", () => {
      const errorPayload: PuzzleErrorPayload = {
        code: "ERR_MALFORMED_SOLUTION_LINE",
        message: "Puzzle moves array contains invalid UCI string",
        puzzleId: "puz_corrupt_999",
        details: { invalidMove: "xyz99" },
      };

      expect(errorPayload.code).toBe("ERR_MALFORMED_SOLUTION_LINE");
      expect(errorPayload.puzzleId).toBe("puz_corrupt_999");
      expect(errorPayload.details?.invalidMove).toBe("xyz99");
    });
  });
});
