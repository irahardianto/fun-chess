import { describe, it, expect } from "vitest";
import type {
  ScenarioCategory,
  ScenarioDifficulty,
  TargetAgeGroup,
  StarRating,
  StepMoveConstraint,
  StepOpponentResponse,
  TutorialStep,
  ChessScenario,
  CurriculumSection,
  ScenarioProgress,
  ScenarioProgressMap,
  ScenarioProgressStore,
  ScenarioRunnerState,
} from "../index.js";

describe("Expanded Academy & Scenario Curriculum Contracts", () => {
  describe("Taxonomy & Difficulty Tiers", () => {
    it("validates all expanded ScenarioCategory taxonomy values", () => {
      const categories: ScenarioCategory[] = [
        "fundamentals",
        "rules_and_basics",
        "special_moves",
        "tactical_patterns",
        "intermediate_tactics",
        "checkmate_patterns",
        "checkmate_families",
        "endgame_basics",
        "endgame_conversions",
        "opening_traps",
      ];

      expect(categories).toHaveLength(10);
      expect(categories).toContain("intermediate_tactics");
      expect(categories).toContain("checkmate_families");
      expect(categories).toContain("endgame_conversions");
      expect(categories).toContain("opening_traps");
      expect(categories).toContain("rules_and_basics");
    });

    it("validates ScenarioDifficulty calibration including master tier", () => {
      const difficulties: ScenarioDifficulty[] = [
        "beginner",
        "intermediate",
        "advanced",
        "master",
      ];
      expect(difficulties).toHaveLength(4);
      expect(difficulties).toContain("master");
      expect(difficulties).toContain("beginner");
    });

    it("validates TargetAgeGroup cohorts and StarRating scale", () => {
      const cohorts: TargetAgeGroup[] = ["5-8", "7-10", "11-15", "all"];
      const stars: StarRating[] = [1, 2, 3];

      expect(cohorts).toHaveLength(4);
      expect(stars).toEqual([1, 2, 3]);
    });
  });

  describe("Scenario Curriculum Entities", () => {
    it("constructs an intermediate tactics scenario (Deflection / Decoy)", () => {
      const scenario: ChessScenario = {
        id: "deflection-tactics-01",
        title: "The Great Deflection Decoy! 🎯",
        subtitle: "Lure the defending King away from protecting the Queen!",
        category: "intermediate_tactics",
        difficulty: "intermediate",
        targetAgeGroup: "11-15",
        icon: "🎯",
        description:
          "Learn how to deflect a key defender so you can deliver a decisive blow.",
        estimatedMinutes: 4,
        steps: [
          {
            id: "step-1",
            stepNumber: 1,
            instruction: "Sacrifice your Rook on d8 to deflect the Black King!",
            conceptExplanation:
              "When the King captures your Rook, the Queen on e7 will lose its defender.",
            hint: "Move your Rook from d1 to d8 with check!",
            setupFen: "3rk3/4q3/8/8/8/8/4Q3/3R2K1 w - - 0 1",
            highlightSquares: ["d1", "d8"],
            threatSquares: ["e8", "e7"],
            playerColor: "w",
            allowedMoves: [{ from: "d1", to: "d8" }],
            opponentResponse: {
              from: "e8",
              to: "d8",
              delayMs: 350,
              dialogue: "My King had to take your Rook!",
            },
            explanationOnSuccess:
              "Great deflection! The Queen on e7 is now completely unprotected!",
          },
          {
            id: "step-2",
            stepNumber: 2,
            instruction: "Now capture the defenseless Queen on e7!",
            hint: "Take the Queen on e7 with your Queen.",
            setupFen: "3k4/4q3/8/8/8/8/4Q3/6K1 w - - 0 2",
            highlightSquares: ["e2", "e7"],
            playerColor: "w",
            allowedMoves: [{ from: "e2", to: "e7" }],
            explanationOnSuccess:
              "Brilliant combination! You won the Queen and the match! ⭐⭐⭐",
          },
        ],
      };

      expect(scenario.id).toBe("deflection-tactics-01");
      expect(scenario.category).toBe("intermediate_tactics");
      expect(scenario.steps).toHaveLength(2);
      expect(scenario.steps[0]?.allowedMoves?.[0]?.to).toBe("d8");
      expect(scenario.steps[0]?.opponentResponse?.dialogue).toContain(
        "King had to take",
      );
    });

    it("constructs a checkmate family scenario (Anastasia Mate)", () => {
      const scenario: ChessScenario = {
        id: "anastasia-mate-01",
        title: "Anastasia's Checkmate! 👑",
        subtitle:
          "Knight and Rook teamwork traps the enemy King against the edge of the board.",
        category: "checkmate_families",
        difficulty: "advanced",
        targetAgeGroup: "11-15",
        icon: "👑",
        description:
          "Experience the famous Anastasia's mate pattern using a Knight to seal escape squares and a Rook on an open file.",
        estimatedMinutes: 5,
        steps: [
          {
            id: "step-1",
            stepNumber: 1,
            instruction:
              "Jump your Knight to e7 to deliver check and seal g8 and g6!",
            hint: "Move your Knight from f5 to e7.",
            setupFen: "5rk1/1p3ppp/8/5N2/8/8/5PPP/4R1K1 w - - 0 1",
            highlightSquares: ["f5", "e7"],
            playerColor: "w",
            allowedMoves: [{ from: "f5", to: "e7" }],
            opponentResponse: {
              from: "g8",
              to: "h8",
              delayMs: 400,
              dialogue: "My King must step into the corner!",
            },
            explanationOnSuccess: "Check delivered and escape squares sealed!",
          },
          {
            id: "step-2",
            stepNumber: 2,
            instruction: "Swing your Rook to h1 (or e8) to deliver checkmate!",
            hint: "Deliver checkmate on the back rank or h-file.",
            setupFen: "5r1k/1p2Nppp/8/8/8/8/5PPP/4R1K1 w - - 1 2",
            highlightSquares: ["e1", "e8"],
            playerColor: "w",
            allowedMoves: [{ from: "e1", to: "e8" }],
            explanationOnSuccess: "Checkmate! Anastasia’s pattern mastered! 🏆",
          },
        ],
      };

      expect(scenario.category).toBe("checkmate_families");
      expect(scenario.difficulty).toBe("advanced");
      expect(scenario.steps).toHaveLength(2);
    });

    it("constructs an endgame conversion scenario (Lucena Position)", () => {
      const scenario: ChessScenario = {
        id: "lucena-position-bridge",
        title: "Building the Lucena Bridge! 🌉",
        subtitle:
          "Learn the fundamental winning technique in Rook and pawn endgames.",
        category: "endgame_conversions",
        difficulty: "master",
        targetAgeGroup: "11-15",
        icon: "🌉",
        description:
          "The Lucena Position is the most important technical endgame in chess. Learn how to build a bridge with your Rook to promote your pawn safely.",
        estimatedMinutes: 6,
        steps: [
          {
            id: "step-1",
            stepNumber: 1,
            instruction:
              "Move your Rook to the 4th rank (f4) to prepare the bridge!",
            hint: "Place your Rook on f4.",
            setupFen: "1K1R4/1P6/8/8/5k2/8/8/5r2 w - - 0 1",
            highlightSquares: ["d8", "d4"],
            playerColor: "w",
            allowedMoves: [{ from: "d8", to: "d4" }],
            explanationOnSuccess:
              "Rook is stationed on the 4th rank ready to shield the King!",
          },
        ],
      };

      expect(scenario.category).toBe("endgame_conversions");
      expect(scenario.difficulty).toBe("master");
      expect(scenario.estimatedMinutes).toBe(6);
    });

    it("constructs an opening trap scenario (Legal’s Trap)", () => {
      const scenario: ChessScenario = {
        id: "legals-trap-queen-sac",
        title: "Legal's Queen Sacrifice Trap! 🎭",
        subtitle: "Punish an early pin with a shocking Knight jump!",
        category: "opening_traps",
        difficulty: "intermediate",
        targetAgeGroup: "7-10",
        icon: "🎭",
        description:
          "Legal's Trap is one of the most famous checkmate traps in chess history, sacrificing the Queen for a forced checkmate.",
        estimatedMinutes: 4,
        steps: [
          {
            id: "step-1",
            stepNumber: 1,
            instruction:
              'Jump your Knight from f3 to e5, leaving your Queen on d1 "unprotected"!',
            hint: "Move your Knight to e5.",
            setupFen:
              "r1bqk2r/pppp1ppp/2n5/4p3/2B1n3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5",
            highlightSquares: ["f3", "e5"],
            playerColor: "w",
            allowedMoves: [{ from: "f3", to: "e5" }],
            opponentResponse: {
              from: "e4",
              to: "d1",
              delayMs: 500,
              dialogue: "Aha! I captured your Queen!",
            },
            explanationOnSuccess:
              "Black took the bait and took the Queen! Now finish the mate!",
          },
        ],
      };

      expect(scenario.category).toBe("opening_traps");
      expect(scenario.steps[0]?.allowedMoves?.[0]?.from).toBe("f3");
    });

    it("constructs a CurriculumSection grouping scenarios", () => {
      const section: CurriculumSection = {
        id: "checkmate_families",
        title: "Checkmate Pattern Families",
        subtitle:
          "Master the classic mating nets: Anastasia, Arabian, Hook, and Vukovic!",
        icon: "👑",
        scenarios: [],
      };

      expect(section.id).toBe("checkmate_families");
      expect(section.scenarios).toEqual([]);
    });
  });

  describe("Scenario Runner State & Backward Compatibility", () => {
    it("supports legacy ScenarioRunnerState instantiation without new optional properties", () => {
      const legacyRunnerState: ScenarioRunnerState = {
        scenario: null,
        currentStepIndex: 0,
        currentStep: null,
        currentFen: "8/8/8/8/8/8/8/8 w - - 0 1",
        totalSteps: 3,
        isCompleted: false,
        hintsUsedCurrentAttempt: 0,
        activeHint: null,
        hintGlowSquare: null,
        isWaitingForBotResponse: false,
        feedbackMessage: null,
        isStepSuccess: false,
        calculatedStars: 3,
      };

      expect(legacyRunnerState.totalSteps).toBe(3);
      expect(legacyRunnerState.mistakesCurrentAttempt).toBeUndefined();
      expect(legacyRunnerState.hintTargetSquare).toBeUndefined();
      expect(legacyRunnerState.isShaking).toBeUndefined();
    });

    it("supports extended ScenarioRunnerState with tactile feedback and mistake counts", () => {
      const extendedRunnerState: ScenarioRunnerState = {
        scenario: null,
        currentStepIndex: 1,
        currentStep: null,
        currentFen: "8/8/8/8/8/8/8/8 w - - 0 1",
        totalSteps: 3,
        isCompleted: false,
        hintsUsedCurrentAttempt: 1,
        mistakesCurrentAttempt: 1,
        activeHint: "Look at the f7 square",
        hintGlowSquare: "c4",
        hintTargetSquare: "f7",
        isWaitingForBotResponse: false,
        feedbackMessage: "Almost! Try attacking f7.",
        isStepSuccess: false,
        isShaking: true,
        calculatedStars: 2,
      };

      expect(extendedRunnerState.mistakesCurrentAttempt).toBe(1);
      expect(extendedRunnerState.hintTargetSquare).toBe("f7");
      expect(extendedRunnerState.isShaking).toBe(true);
      expect(extendedRunnerState.calculatedStars).toBe(2);
    });
  });

  describe("Scenario Progress Store Contract", () => {
    it("implements ScenarioProgressStore with in-memory map adapter", async () => {
      let storeMap: ScenarioProgressMap = {};

      const testStore: ScenarioProgressStore = {
        async getProgressMap(): Promise<ScenarioProgressMap> {
          return { ...storeMap };
        },
        async getProgress(
          scenarioId: string,
        ): Promise<ScenarioProgress | null> {
          return storeMap[scenarioId] ?? null;
        },
        async saveProgress(
          scenarioId: string,
          stars: StarRating,
          hintsUsed: number,
        ): Promise<ScenarioProgress> {
          const existing = storeMap[scenarioId];
          const record: ScenarioProgress = {
            scenarioId,
            starsEarned: existing
              ? (Math.max(existing.starsEarned, stars) as StarRating)
              : stars,
            attemptsCount: (existing?.attemptsCount ?? 0) + 1,
            hintsUsedTotal: (existing?.hintsUsedTotal ?? 0) + hintsUsed,
            firstCompletedAt: existing?.firstCompletedAt ?? Date.now(),
            lastCompletedAt: Date.now(),
          };
          storeMap[scenarioId] = record;
          return record;
        },
        async resetAllProgress(): Promise<void> {
          storeMap = {};
        },
        async restoreProgressMap(map: ScenarioProgressMap): Promise<void> {
          storeMap = { ...map };
        },
      };

      const initialMap = await testStore.getProgressMap();
      expect(Object.keys(initialMap)).toHaveLength(0);

      const saved = await testStore.saveProgress("anastasia-mate-01", 3, 0);
      expect(saved.scenarioId).toBe("anastasia-mate-01");
      expect(saved.starsEarned).toBe(3);
      expect(saved.attemptsCount).toBe(1);

      const retrieved = await testStore.getProgress("anastasia-mate-01");
      expect(retrieved?.starsEarned).toBe(3);

      // Verify restoreProgressMap restores full progress map in bulk
      const bulkMap: ScenarioProgressMap = {
        "restored-lesson-1": {
          scenarioId: "restored-lesson-1",
          starsEarned: 3,
          attemptsCount: 5,
          hintsUsedTotal: 2,
          firstCompletedAt: 1699990000000,
          lastCompletedAt: 1700000000000,
        },
      };
      await testStore.restoreProgressMap(bulkMap);
      const restored = await testStore.getProgressMap();
      expect(restored["restored-lesson-1"]?.attemptsCount).toBe(5);
      expect(restored["restored-lesson-1"]?.starsEarned).toBe(3);
      expect(restored["restored-lesson-1"]?.firstCompletedAt).toBe(1699990000000);
      expect(restored["anastasia-mate-01"]).toBeUndefined();

      await testStore.resetAllProgress();
      const resetMap = await testStore.getProgressMap();
      expect(Object.keys(resetMap)).toHaveLength(0);
    });
  });
});
