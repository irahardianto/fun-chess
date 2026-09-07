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
  SessionInfo,
  SavedSession,
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
  // Error classes
  AppError,
  RoomNotFoundError,
  RoomFullError,
  InvalidMoveError,
  RateLimitExceededError,
  UnauthorizedError,
  // Schemas
  RoomCodeSchema,
  PlayerNameSchema,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  ReconnectRequestSchema,
  MovePayloadSchema,
} from "../index.js";

describe("Shared Contracts & Data Model Specification", () => {
  describe("Chess Core & Multiplayer Models", () => {
    it("validates Player and RoomState structure (without sessionToken per CRIT-001)", () => {
      const player: Player = {
        id: "player-uuid-1",
        socketId: "socket-abc-123",
        name: "Alex",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: 1700000000000,
      };

      expect("sessionToken" in player).toBe(false);

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

    it("validates SessionInfo and SavedSession models (CRIT-001 private credentials)", () => {
      const sessionInfo: SessionInfo = {
        sessionToken: "session-secret-token-uuid-1234",
        playerId: "player-uuid-1",
        roomCode: "ABCD",
        createdAt: 1700000000000,
        lastSeenAt: 1700000005000,
      };

      const savedSession: SavedSession = {
        roomCode: "ABCD",
        playerId: "player-uuid-1",
        sessionToken: "session-secret-token-uuid-1234",
      };

      expect(sessionInfo.sessionToken).toBe("session-secret-token-uuid-1234");
      expect(sessionInfo.playerId).toBe("player-uuid-1");
      expect(sessionInfo.roomCode).toBe("ABCD");
      expect(sessionInfo.createdAt).toBe(1700000000000);
      expect(sessionInfo.lastSeenAt).toBe(1700000005000);

      expect(savedSession.roomCode).toBe("ABCD");
      expect(savedSession.playerId).toBe("player-uuid-1");
      expect(savedSession.sessionToken).toBe("session-secret-token-uuid-1234");
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

    it("validates AppError and custom error classes with status codes, error codes, and isAppError flag", () => {
      const notFound = new RoomNotFoundError("ABCD");
      expect(notFound.isAppError).toBe(true);
      expect(notFound.code).toBe("ERR_ROOM_NOT_FOUND");
      expect(notFound.statusCode).toBe(404);
      expect(notFound.message).toBe("Room with code 'ABCD' does not exist");
      expect(notFound.details).toEqual({ roomCode: "ABCD" });
      expect(notFound).toBeInstanceOf(AppError);
      expect(notFound).toBeInstanceOf(Error);

      const roomFull = new RoomFullError("WXYZ");
      expect(roomFull.isAppError).toBe(true);
      expect(roomFull.code).toBe("ERR_ROOM_FULL");
      expect(roomFull.statusCode).toBe(409);
      expect(roomFull.message).toBe("Room 'WXYZ' already has 2 active players");
      expect(roomFull.details).toEqual({ roomCode: "WXYZ" });
      expect(roomFull).toBeInstanceOf(AppError);

      const invalidMove = new InvalidMoveError("illegal destination square", { from: "e2", to: "e5" });
      expect(invalidMove.isAppError).toBe(true);
      expect(invalidMove.code).toBe("ERR_INVALID_MOVE");
      expect(invalidMove.statusCode).toBe(422);
      expect(invalidMove.message).toBe("Illegal chess move: illegal destination square");
      expect(invalidMove.details).toEqual({ from: "e2", to: "e5" });
      expect(invalidMove).toBeInstanceOf(AppError);

      const rateLimit = new RateLimitExceededError();
      expect(rateLimit.isAppError).toBe(true);
      expect(rateLimit.code).toBe("ERR_RATE_LIMITED");
      expect(rateLimit.statusCode).toBe(429);
      expect(rateLimit.message).toContain("Rate limit exceeded");
      expect(rateLimit).toBeInstanceOf(AppError);

      const unauthorized = new UnauthorizedError();
      expect(unauthorized.isAppError).toBe(true);
      expect(unauthorized.code).toBe("ERR_UNAUTHORIZED");
      expect(unauthorized.statusCode).toBe(401);
      expect(unauthorized.message).toContain("Unauthorized");
      expect(unauthorized).toBeInstanceOf(AppError);
    });
  });

  describe("Zod Ingress Schemas (schemas.ts)", () => {
    describe("RoomCodeSchema", () => {
      it("parses and normalizes valid 4-character alphanumeric room codes", () => {
        expect(RoomCodeSchema.parse("abcd")).toBe("ABCD");
        expect(RoomCodeSchema.parse("WXYZ")).toBe("WXYZ");
        expect(RoomCodeSchema.parse("a1b2")).toBe("A1B2");
        expect(RoomCodeSchema.parse("  k7m9  ")).toBe("K7M9");
      });

      it("fails validation for invalid room codes", () => {
        expect(() => RoomCodeSchema.parse("abc")).toThrow();
        expect(() => RoomCodeSchema.parse("abcde")).toThrow();
        expect(() => RoomCodeSchema.parse("AB-C")).toThrow();
        expect(() => RoomCodeSchema.parse("")).toThrow();
        expect(() => RoomCodeSchema.parse(1234)).toThrow();
      });
    });

    describe("PlayerNameSchema", () => {
      it("parses and sanitizes valid player names", () => {
        expect(PlayerNameSchema.parse("Alex")).toBe("Alex");
        expect(PlayerNameSchema.parse("  Sam  ")).toBe("Sam");
        expect(PlayerNameSchema.parse("<b>Sam</b>")).toBe("bSam/b");
        expect(PlayerNameSchema.parse("Tom & Jerry")).toBe("Tom  Jerry");
      });

      it("fails validation for empty, whitespace-only, or overly long player names", () => {
        expect(() => PlayerNameSchema.parse("")).toThrow();
        expect(() => PlayerNameSchema.parse("   ")).toThrow();
        expect(() => PlayerNameSchema.parse("A".repeat(21))).toThrow();
      });
    });

    describe("CreateRoomRequestSchema", () => {
      it("parses valid CreateRoom requests with explicit and default options", () => {
        const parsed = CreateRoomRequestSchema.parse({
          playerName: "Charlie",
          preferredColor: "w",
          avatar: "🦁",
        });
        expect(parsed.playerName).toBe("Charlie");
        expect(parsed.preferredColor).toBe("w");
        expect(parsed.avatar).toBe("🦁");

        const defaultParsed = CreateRoomRequestSchema.parse({
          playerName: "Dave",
        });
        expect(defaultParsed.preferredColor).toBe("random");
        expect(defaultParsed.avatar).toBe("🦁");
      });

      it("fails validation for invalid CreateRoom requests", () => {
        expect(() => CreateRoomRequestSchema.parse({ playerName: "" })).toThrow();
        expect(() =>
          CreateRoomRequestSchema.parse({
            playerName: "Valid",
            preferredColor: "purple",
          }),
        ).toThrow();
      });
    });

    describe("JoinRoomRequestSchema", () => {
      it("parses valid JoinRoom requests and normalizes roomCode", () => {
        const parsed = JoinRoomRequestSchema.parse({
          roomCode: "abcd",
          playerName: "Eve",
        });
        expect(parsed.roomCode).toBe("ABCD");
        expect(parsed.playerName).toBe("Eve");
        expect(parsed.avatar).toBe("🦁");
      });

      it("fails validation for invalid JoinRoom requests", () => {
        expect(() =>
          JoinRoomRequestSchema.parse({
            roomCode: "too-long",
            playerName: "Eve",
          }),
        ).toThrow();
        expect(() =>
          JoinRoomRequestSchema.parse({
            roomCode: "ABCD",
            playerName: "",
          }),
        ).toThrow();
      });
    });

    describe("ReconnectRequestSchema", () => {
      it("parses valid Reconnect requests", () => {
        const validUuid = "123e4567-e89b-12d3-a456-426614174000";
        const parsed = ReconnectRequestSchema.parse({
          roomCode: "abcd",
          playerId: validUuid,
          sessionToken: "session-secret-token-123",
        });
        expect(parsed.roomCode).toBe("ABCD");
        expect(parsed.playerId).toBe(validUuid);
        expect(parsed.sessionToken).toBe("session-secret-token-123");
      });

      it("fails validation when playerId is not a valid UUID or sessionToken is empty", () => {
        expect(() =>
          ReconnectRequestSchema.parse({
            roomCode: "ABCD",
            playerId: "not-a-valid-uuid",
            sessionToken: "token",
          }),
        ).toThrow();

        expect(() =>
          ReconnectRequestSchema.parse({
            roomCode: "ABCD",
            playerId: "123e4567-e89b-12d3-a456-426614174000",
            sessionToken: "",
          }),
        ).toThrow();
      });
    });

    describe("MovePayloadSchema", () => {
      it("parses valid standard and promotion moves", () => {
        const standardMove = MovePayloadSchema.parse({
          from: "e2",
          to: "e4",
        });
        expect(standardMove.from).toBe("e2");
        expect(standardMove.to).toBe("e4");
        expect(standardMove.promotion).toBeUndefined();

        const promoMove = MovePayloadSchema.parse({
          from: "e7",
          to: "e8",
          promotion: "q",
        });
        expect(promoMove.promotion).toBe("q");
      });

      it("fails validation for invalid square coordinates or promotion pieces", () => {
        // Invalid square ranks or files
        expect(() => MovePayloadSchema.parse({ from: "e9", to: "e4" })).toThrow();
        expect(() => MovePayloadSchema.parse({ from: "i1", to: "e4" })).toThrow();
        expect(() => MovePayloadSchema.parse({ from: "e2", to: "invalid" })).toThrow();

        // Invalid promotion piece (King or Pawn cannot be promotion targets)
        expect(() =>
          MovePayloadSchema.parse({
            from: "e7",
            to: "e8",
            promotion: "k",
          }),
        ).toThrow();
        expect(() =>
          MovePayloadSchema.parse({
            from: "e7",
            to: "e8",
            promotion: "p",
          }),
        ).toThrow();
      });
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
