import { describe, it, expect } from "vitest";
import type {
  // Models
  Square,
  PieceColor,
  PieceType,
  RoomStatus,
  GameOverReason,
  Player,
  MovePayload,
  MoveResult,
  GameState,
  RematchState,
  RoomState,
  GameOverPayload,
  // Errors
  ErrorCode,
  SocketErrorPayload,
  // Scenario contracts
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
  // AI contracts
  AiDifficultyLevel,
  MascotId,
  MascotDialogueTrigger,
  MascotPersona,
  EvaluationScore,
  PieceSquareTable,
  PieceSquareTableSet,
  AiSearchConfig,
  AiMoveEvaluation,
  ChessAiEngine,
  HintTheme,
  HintRecommendation,
  HintCalculator,
  TakebackSnapshot,
  SoloAiGameState,
  // Navigation contracts
  AppGameMode,
  LobbyModeOption,
  SoloAiLaunchConfig,
  AcademyLaunchConfig,
  AppShellState,
  AppShellEventMap,
  // Audio contracts
  SoundEffectType,
  // Avatar contracts
  PlayerAvatar,
  // Sync contracts
  UnifiedProgressPayload,
  UnifiedProgressEnvelope,
  SyncMergeStrategy,
  ProgressDiffPreview,
} from "../index.js";
import {
  FUN_CHESS_PAYLOAD_MAGIC_PREFIX,
  UNIFIED_PROGRESS_SCHEMA_VERSION,
  PLAYER_AVATARS,
  DEFAULT_PLAYER_AVATAR,
  DEFAULT_OPPONENT_AVATAR,
} from "../index.js";

describe("Shared Contracts & Data Model Specification", () => {
  describe("Chess Core & Multiplayer Models", () => {
    it("validates Player and RoomState structure", () => {
      const player: Player = {
        id: "player-uuid-1",
        socketId: "socket-abc-123",
        name: "Alex",
        color: "w",
        isHost: true,
        isConnected: true,
        sessionToken: "token-secret-xyz",
        connectedAt: 1700000000000,
      };

      const room: RoomState = {
        roomCode: "ABCD",
        status: "playing",
        hostId: player.id,
        whitePlayer: player,
        blackPlayer: null,
        spectators: [],
        game: {
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "w",
          isCheck: false,
          isCheckmate: false,
          isDraw: false,
          isStalemate: false,
          isThreefoldRepetition: false,
          isInsufficientMaterial: false,
          isFiftyMoveRule: false,
          moveHistory: [],
          capturedWhite: [],
          capturedBlack: [],
          materialAdvantage: { white: 0, black: 0 },
          lastMove: null,
          moveCount: 0,
        },
        rematch: null,
        createdAt: 1700000000000,
        lastActivityAt: 1700000000000,
      };

      expect(room.roomCode).toBe("ABCD");
      expect(room.status).toBe("playing");
      expect(room.game.turn).toBe("w");
      expect(room.whitePlayer?.name).toBe("Alex");
    });

    it("validates GameOverPayload and GameOverReason union values", () => {
      const reasons: GameOverReason[] = [
        "checkmate",
        "stalemate",
        "threefold_repetition",
        "insufficient_material",
        "fifty_move_rule",
        "resignation",
        "draw_agreement",
        "abandonment",
      ];

      const gameOver: GameOverPayload = {
        winner: "w",
        winnerName: "Alex",
        reason: "checkmate",
        message: "Checkmate! Alex wins the match! 🏆",
        finalFen:
          "r1bqkb1r/pppp1Qpp/2n5/4p3/2B1n3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
        totalMoves: 7,
        durationSeconds: 45,
      };

      expect(reasons).toContain(gameOver.reason);
      expect(gameOver.winner).toBe("w");
      expect(gameOver.durationSeconds).toBe(45);
    });

    it("validates SocketErrorPayload and ErrorCode contract values", () => {
      const errorPayload: SocketErrorPayload = {
        code: "ERR_ROOM_NOT_FOUND",
        message: "Room ABCD does not exist",
        roomCode: "ABCD",
        correlationId: "corr-1234-5678",
        details: { requestedCode: "ABCD" },
      };

      expect(errorPayload.code).toBe("ERR_ROOM_NOT_FOUND");
      expect(errorPayload.message).toContain("does not exist");
      expect(errorPayload.roomCode).toBe("ABCD");
      expect(errorPayload.correlationId).toBe("corr-1234-5678");
    });
  });

  describe("Academy & Scenario Contracts", () => {
    it("validates Scenario categories and difficulty levels", () => {
      const categories: ScenarioCategory[] = [
        "fundamentals",
        "special_moves",
        "tactical_patterns",
        "checkmate_patterns",
        "endgame_basics",
      ];
      const difficulties: ScenarioDifficulty[] = [
        "beginner",
        "intermediate",
        "advanced",
      ];
      const ageGroups: TargetAgeGroup[] = ["7-10", "11-15", "all"];
      const starRatings: StarRating[] = [1, 2, 3];

      expect(categories).toHaveLength(5);
      expect(difficulties).toHaveLength(3);
      expect(ageGroups).toHaveLength(3);
      expect(starRatings).toEqual([1, 2, 3]);
    });

    it("constructs a multi-step ChessScenario conforming to TutorialStep contract", () => {
      const scenario: ChessScenario = {
        id: "royal-fork-practice",
        title: "The Royal Fork! ♞",
        subtitle: "Attack the King and Rook simultaneously",
        category: "tactical_patterns",
        difficulty: "beginner",
        targetAgeGroup: "7-10",
        icon: "♞",
        description:
          "Learn how the Knight jumps in an L-shape to attack two pieces at once!",
        estimatedMinutes: 3,
        steps: [
          {
            id: "step-1",
            stepNumber: 1,
            instruction:
              "Jump your Knight to c7 to deliver check and attack the Rook!",
            conceptExplanation:
              "Knights are the only pieces that can jump over other pieces.",
            hint: "Look for the square c7 between the Black King on e8 and Rook on a8.",
            setupFen: "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1",
            highlightSquares: ["b5", "c7"],
            threatSquares: ["e8", "a8"],
            playerColor: "w",
            allowedMoves: [{ from: "b5", to: "c7" }],
            opponentResponse: {
              from: "e8",
              to: "d8",
              delayMs: 400,
              dialogue: "My King must run away!",
            },
            explanationOnSuccess: "Boom! Double attack delivered!",
          },
          {
            id: "step-2",
            stepNumber: 2,
            instruction: "Now capture the defenseless Rook on a8!",
            hint: "Take the piece on a8.",
            setupFen: "r2k4/2N5/8/8/8/8/8/4K3 w - - 1 2",
            highlightSquares: ["c7", "a8"],
            threatSquares: ["a8"],
            playerColor: "w",
            allowedMoves: [{ from: "c7", to: "a8" }],
            explanationOnSuccess:
              "You captured the Rook and won the lesson! ⭐⭐⭐",
          },
        ],
      };

      expect(scenario.id).toBe("royal-fork-practice");
      expect(scenario.steps).toHaveLength(2);
      expect(scenario.steps[0]?.allowedMoves?.[0]?.from).toBe("b5");
      expect(scenario.steps[0]?.allowedMoves?.[0]?.to).toBe("c7");
      expect(scenario.steps[0]?.opponentResponse?.dialogue).toBe(
        "My King must run away!",
      );
    });

    it("validates ScenarioProgress and ScenarioRunnerState schemas", () => {
      const progress: ScenarioProgress = {
        scenarioId: "royal-fork-practice",
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1700000000000,
        lastCompletedAt: 1700000000000,
      };

      const runnerState: ScenarioRunnerState = {
        scenario: null,
        currentStepIndex: 0,
        currentStep: null,
        currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        totalSteps: 2,
        isCompleted: false,
        hintsUsedCurrentAttempt: 0,
        activeHint: null,
        hintGlowSquare: null,
        isWaitingForBotResponse: false,
        feedbackMessage: null,
        isStepSuccess: false,
        calculatedStars: 3,
      };

      expect(progress.starsEarned).toBe(3);
      expect(runnerState.calculatedStars).toBe(3);
      expect(runnerState.isCompleted).toBe(false);
    });
  });

  describe("Single-Player AI & Mascot Persona Contracts", () => {
    it("validates 4 calibrated AI difficulty tiers and mascot IDs", () => {
      const levels: AiDifficultyLevel[] = [
        "novice",
        "beginner",
        "intermediate",
        "club",
      ];
      const mascots: MascotId[] = ["peanut", "sparky", "fox", "owl"];
      const triggers: MascotDialogueTrigger[] = [
        "game_start",
        "player_move",
        "ai_move",
        "player_check",
        "ai_check",
        "player_blunder",
        "ai_blunder",
        "player_win",
        "ai_win",
        "draw",
        "hint_requested",
        "takeback_used",
      ];

      expect(levels).toHaveLength(4);
      expect(mascots).toHaveLength(4);
      expect(triggers).toHaveLength(12);
    });

    it("constructs a full MascotPersona complying with character specifications", () => {
      const peanutPup: MascotPersona = {
        id: "peanut",
        name: "Peanut the Pup",
        avatar: "🐶",
        title: "Playful Pup",
        eloEstimate: 400,
        difficulty: "novice",
        description:
          "Peanut loves wagging his tail and jumping pawns forward! Makes lots of silly mistakes.",
        themeColor: "#ff9800",
        dialogues: {
          game_start: ["Woof! Let us play chess!", "Tail wagging ready!"],
          player_move: ["Nice jump!", "Ooh, interesting!"],
          ai_move: ["Paws on the board!", "Woof woof!"],
          player_check: ["Ruff! My king is tickled!"],
          ai_check: ["Check! Bark bark!"],
          player_blunder: ["Did you mean to leave that treat?"],
          ai_blunder: ["Oopsie! Dropped my bone!"],
          player_win: ["Good game! You are a master! 🐾"],
          ai_win: ["Yay, Peanut got a treat! Good match!"],
          draw: ["A tie! High paw! 🐾"],
          hint_requested: ["Sniffing out a good move for you! 💡"],
          takeback_used: ["Rewind time! Try another square! ⏪"],
        },
      };

      expect(peanutPup.id).toBe("peanut");
      expect(peanutPup.eloEstimate).toBe(400);
      expect(peanutPup.dialogues.game_start).toHaveLength(2);
      expect(peanutPup.dialogues.takeback_used[0]).toContain("Rewind");
    });

    it("validates AiSearchConfig and AiMoveEvaluation contracts", () => {
      const config: AiSearchConfig = {
        depth: 3,
        blunderChance: 0.25,
        maxBlunderScoreDrop: 150,
        evaluationNoise: 20,
        usePst: true,
        useQuiescence: true,
        simulatedThinkTimeMs: [200, 600],
      };

      const evaluation: AiMoveEvaluation = {
        move: { from: "e2", to: "e4" },
        score: 45,
        depth: 3,
        nodesEvaluated: 412,
        isBlunder: false,
        searchDurationMs: 38,
      };

      expect(config.depth).toBe(3);
      expect(config.blunderChance).toBe(0.25);
      expect(evaluation.move.to).toBe("e4");
      expect(evaluation.isBlunder).toBe(false);
    });

    it("validates HintRecommendation and TakebackSnapshot schemas", () => {
      const hint: HintRecommendation = {
        move: { from: "c3", to: "a5" },
        sourceSquare: "c3",
        targetSquare: "a5",
        explanation: "Capture the undefended Rook on a5! 🎯",
        theme: "capture_free_piece",
        scoreAdvantage: 500,
      };

      const snapshot: TakebackSnapshot = {
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        turn: "b",
        moveCount: 1,
        capturedWhite: [],
        capturedBlack: [],
      };

      expect(hint.theme).toBe("capture_free_piece");
      expect(hint.scoreAdvantage).toBe(500);
      expect(snapshot.moveCount).toBe(1);
    });
  });

  describe("Shell Navigation & Audio Contracts", () => {
    it("validates AppGameMode options and launch configurations", () => {
      const modes: AppGameMode[] = [
        "lobby",
        "multiplayer_lan",
        "solo_ai",
        "academy",
      ];
      const soloConfig: SoloAiLaunchConfig = {
        mascotId: "fox",
        playerColor: "w",
        playerName: "Elena",
        playerAvatar: "🦊",
      };
      const academyConfig: AcademyLaunchConfig = {
        scenarioId: "knight-fork-royalty",
        autoStartStep: 1,
      };

      const shellState: AppShellState = {
        currentMode: "solo_ai",
        soloAiConfig: soloConfig,
        academyConfig: null,
        isMuted: false,
        isDarkMode: false,
      };

      expect(modes).toHaveLength(4);
      expect(shellState.currentMode).toBe("solo_ai");
      expect(shellState.soloAiConfig?.mascotId).toBe("fox");
      expect(academyConfig.scenarioId).toBe("knight-fork-royalty");
    });

    it("validates SoundEffectType enumeration completeness", () => {
      const soundEffects: SoundEffectType[] = [
        "move",
        "capture",
        "check",
        "victory",
        "draw",
        "start",
        "error",
        "hint",
        "star_earned",
        "mascot_happy",
        "mascot_blunder",
        "step_complete",
      ];

      expect(soundEffects).toHaveLength(12);
      expect(soundEffects).toContain("hint");
      expect(soundEffects).toContain("star_earned");
      expect(soundEffects).toContain("mascot_happy");
      expect(soundEffects).toContain("mascot_blunder");
    });
  });

  describe("Progress Synchronization & Codec Contracts", () => {
    it("validates constants and envelope magic definitions", () => {
      expect(FUN_CHESS_PAYLOAD_MAGIC_PREFIX).toBe("FC1:");
      expect(UNIFIED_PROGRESS_SCHEMA_VERSION).toBe(1);
    });

    it("validates UnifiedProgressPayload and UnifiedProgressEnvelope structure", () => {
      const payload: UnifiedProgressPayload = {
        version: UNIFIED_PROGRESS_SCHEMA_VERSION,
        exportedAt: 1700000000000,
        clientVersion: "1.0.0",
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

      const envelope: UnifiedProgressEnvelope = {
        magic: "FC_PROGRESS_V1",
        schemaVersion: UNIFIED_PROGRESS_SCHEMA_VERSION,
        exportedAt: "2026-08-27T00:00:00.000Z",
        checksum: "12345678",
        payload,
      };

      expect(envelope.magic).toBe("FC_PROGRESS_V1");
      expect(envelope.schemaVersion).toBe(1);
      expect(envelope.payload.version).toBe(1);
    });

    it("validates SyncMergeStrategy values", () => {
      const strategies: SyncMergeStrategy[] = [
        "smart_merge",
        "replace_local",
        "keep_local",
      ];
      expect(strategies).toHaveLength(3);
      expect(strategies).toContain("smart_merge");
    });
  });

  describe("Avatar Contracts", () => {
    it("validates player avatar list and default fallback constants", () => {
      expect(PLAYER_AVATARS).toContain("🦁");
      expect(PLAYER_AVATARS).toContain("🐼");
      expect(PLAYER_AVATARS).toContain("🚀");
      expect(PLAYER_AVATARS).toContain("🦄");
      expect(PLAYER_AVATARS).toContain("⚡");
      expect(PLAYER_AVATARS).toContain("👑");
      expect(PLAYER_AVATARS).toHaveLength(6);

      expect(DEFAULT_PLAYER_AVATAR).toBe("🦁");
      expect(DEFAULT_OPPONENT_AVATAR).toBe("🐼");
      expect(PLAYER_AVATARS).toContain(DEFAULT_PLAYER_AVATAR);
      expect(PLAYER_AVATARS).toContain(DEFAULT_OPPONENT_AVATAR);
      expect(DEFAULT_PLAYER_AVATAR).not.toBe(DEFAULT_OPPONENT_AVATAR);

      const customAvatar: PlayerAvatar = "🦄";
      expect(PLAYER_AVATARS).toContain(customAvatar);
    });
  });
});
