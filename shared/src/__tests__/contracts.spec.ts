import { describe, it, expect } from "vitest";
import type {
  // Models
  GameOverReason,
  Player,
  MoveResult,
  PromotionPiece,
  RoomState,
  GameOverPayload,
  SessionInfo,
  SavedSession,
  // Errors
  SocketErrorPayload,
  // Scenario contracts
  ScenarioCategory,
  ScenarioDifficulty,
  TargetAgeGroup,
  StarRating,
  ChessScenario,
  ScenarioProgress,
  ScenarioRunnerState,
  // AI contracts
  AiDifficultyLevel,
  MascotId,
  MascotDialogueTrigger,
  MascotPersona,
  AiSearchConfig,
  AiMoveEvaluation,
  HintRecommendation,
  TakebackSnapshot,
  // Navigation contracts
  AppGameMode,
  SoloAiLaunchConfig,
  AcademyLaunchConfig,
  AppShellState,
  // Audio contracts
  SoundEffectType,
  // Avatar contracts
  PlayerAvatar,
  // Sync contracts
  UnifiedProgressPayload,
  UnifiedProgressEnvelope,
  SyncMergeStrategy,
  IClock,
  IIdGenerator,
  ErrorCode,
  ClientToServerEvents,
  ServerToClientEvents,
  RoomLeavePayload,
  PlayerLeftReason,
  RoomPlayerLeftPayload,
  CreateRoomSuccessAck,
  CreateRoomAckResponse,
  CreateRoomSuccessResponse,
  CreateRoomResponse,
  PlayerDisconnectedPayload,
} from "../index.js";
import {
  normalizeRoomCode,
  validatePlayerName,
  FUN_CHESS_PAYLOAD_MAGIC_PREFIX,
  UNIFIED_PROGRESS_SCHEMA_VERSION,
  PLAYER_AVATARS,
  DEFAULT_PLAYER_AVATAR,
  DEFAULT_OPPONENT_AVATAR,
  AppError,
  RoomNotFoundError,
  RoomFullError,
  InvalidRoomCodeError,
  InvalidMoveError,
  NotYourTurnError,
  GameNotActiveError,
  PlayerNotInRoomError,
  InvalidPayloadError,
  RateLimitExceededError,
  UnauthorizedError,
  OptimisticLockConflictError,
  // Schemas
  RoomCodeSchema,
  PlayerNameSchema,
  AvatarEmojiSchema,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  ReconnectRequestSchema,
  MovePayloadSchema,
  MakeMoveRequestSchema,
  ServerEnvSchema,
  LivenessHealthResponseSchema,
  DetailedHealthResponseSchema,
  HealthCheckResponseSchema,
  HttpErrorBodySchema,
  HttpErrorEnvelopeSchema,
  UrlSchema,
  safeParseUrl,
  normalizeUrlString,
  PieceTypeSchema,
  PromotionPieceSchema,
  PlayerSchema,
  MoveResultSchema,
  GameStateSchema,
  RematchStateSchema,
  DrawOfferSchema,
  RoomStatusSchema,
  RoomStateSchema,
  GameOverReasonSchema,
  GameOverPayloadSchema,
  UnifiedProgressPayloadSchema,
  UnifiedProgressEnvelopeSchema,
  CreateRoomSuccessResponseSchema,
  CreateRoomResponseSchema,
  PlayerLeftReasonSchema,
  RoomPlayerLeftPayloadSchema,
  PuzzleThemeSchema,
  ThemeMasteryProgressSchema,
  PUZZLE_THEMES,
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

      const conflict = new OptimisticLockConflictError("ABCD", 1, 2);
      expect(conflict.isAppError).toBe(true);
      expect(conflict.code).toBe("ERR_CONFLICT");
      expect(conflict.statusCode).toBe(409);
      expect(conflict.message).toContain("State conflict for room 'ABCD'");
      expect(conflict.name).toBe("OptimisticLockConflictError");
      expect(conflict.roomCode).toBe("ABCD");
      expect(conflict.expectedVersion).toBe(1);
      expect(conflict.actualVersion).toBe(2);
      expect(conflict.details).toEqual({
        roomCode: "ABCD",
        expectedVersion: 1,
        actualVersion: 2,
      });
      expect(conflict).toBeInstanceOf(AppError);
      expect(conflict).toBeInstanceOf(OptimisticLockConflictError);

      const invalidRoomCode = new InvalidRoomCodeError("ABC");
      expect(invalidRoomCode.isAppError).toBe(true);
      expect(invalidRoomCode.code).toBe("ERR_INVALID_ROOM_CODE");
      expect(invalidRoomCode.statusCode).toBe(400);
      expect(invalidRoomCode.message).toContain("Invalid room code 'ABC'");
      expect(invalidRoomCode).toBeInstanceOf(AppError);

      const notYourTurn = new NotYourTurnError();
      expect(notYourTurn.isAppError).toBe(true);
      expect(notYourTurn.code).toBe("ERR_NOT_YOUR_TURN");
      expect(notYourTurn.statusCode).toBe(403);
      expect(notYourTurn.message).toContain("not your turn");
      expect(notYourTurn).toBeInstanceOf(AppError);

      const gameNotActive = new GameNotActiveError("lobby");
      expect(gameNotActive.isAppError).toBe(true);
      expect(gameNotActive.code).toBe("ERR_GAME_NOT_ACTIVE");
      expect(gameNotActive.statusCode).toBe(400);
      expect(gameNotActive.message).toContain("Game is not currently active");
      expect(gameNotActive.details).toEqual({ status: "lobby" });
      expect(gameNotActive).toBeInstanceOf(AppError);

      const playerNotInRoom = new PlayerNotInRoomError("socket-123");
      expect(playerNotInRoom.isAppError).toBe(true);
      expect(playerNotInRoom.code).toBe("ERR_PLAYER_NOT_IN_ROOM");
      expect(playerNotInRoom.statusCode).toBe(403);
      expect(playerNotInRoom.message).toContain("Socket does not belong");
      expect(playerNotInRoom.details).toEqual({ socketId: "socket-123" });
      expect(playerNotInRoom).toBeInstanceOf(AppError);

      const invalidPayload = new InvalidPayloadError("roomCode", "too short");
      expect(invalidPayload.isAppError).toBe(true);
      expect(invalidPayload.code).toBe("ERR_INVALID_PAYLOAD");
      expect(invalidPayload.statusCode).toBe(400);
      expect(invalidPayload.message).toContain("Invalid payload: roomCode - too short");
      expect(invalidPayload.details).toEqual({ field: "roomCode", reason: "too short" });
      expect(invalidPayload).toBeInstanceOf(AppError);
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
      it("parses and validates valid player names according to allowlist", () => {
        expect(PlayerNameSchema.parse("Alex")).toBe("Alex");
        expect(PlayerNameSchema.parse("  Sam  ")).toBe("Sam");
        expect(PlayerNameSchema.parse("Player_1")).toBe("Player_1");
        expect(PlayerNameSchema.parse("Grandmaster.99")).toBe("Grandmaster.99");
        expect(PlayerNameSchema.parse("User-Name")).toBe("User-Name");
      });

      it("fails validation for invalid characters, empty, whitespace-only, or overly long names", () => {
        expect(() => PlayerNameSchema.parse("<b>Sam</b>")).toThrow();
        expect(() => PlayerNameSchema.parse("Tom & Jerry")).toThrow();
        expect(() => PlayerNameSchema.parse("")).toThrow();
        expect(() => PlayerNameSchema.parse("   ")).toThrow();
        expect(() => PlayerNameSchema.parse("A".repeat(21))).toThrow();
      });
    });

    describe("AvatarEmojiSchema", () => {
      it("accepts valid emoji characters", () => {
        const validEmojis = ["🦁", "🚀", "🦄", "⚡", "👑", "🐼"];
        for (const emoji of validEmojis) {
          expect(AvatarEmojiSchema.parse(emoji)).toBe(emoji);
        }
      });

      it("accepts undefined and defaults to 🦁", () => {
        expect(AvatarEmojiSchema.parse(undefined)).toBe("🦁");
      });

      it("rejects ASCII control characters and non-printable sequences", () => {
        const invalidInputs = [
          "🦁\x00",
          "\x1F",
          "🚀\x7F",
          "test\n",
          "\t",
          "avatar\x08",
          "\x9F",
        ];
        for (const input of invalidInputs) {
          expect(() => AvatarEmojiSchema.parse(input)).toThrow();
        }
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

    describe("ServerEnvSchema", () => {
      it("parses empty environment using safe defaults", () => {
        const env = ServerEnvSchema.parse({});
        expect(env.NODE_ENV).toBe("development");
        expect(env.PORT).toBe(3000);
        expect(env.HOST).toBe("0.0.0.0");
        expect(env.LOG_LEVEL).toBe("info");
        expect(env.CORS_ORIGIN).toBeUndefined();
        expect(env.PUBLIC_URL).toBeUndefined();
        expect(env.LAN_IP).toBeUndefined();
        expect(env.HOST_IP).toBeUndefined();
      });

      it("coerces numeric string PORT and allows port 0", () => {
        const env8080 = ServerEnvSchema.parse({ PORT: "8080" });
        expect(env8080.PORT).toBe(8080);

        const env0 = ServerEnvSchema.parse({ PORT: 0 });
        expect(env0.PORT).toBe(0);

        const envStr0 = ServerEnvSchema.parse({ PORT: "0" });
        expect(envStr0.PORT).toBe(0);
      });

      it("preprocesses empty and whitespace-only strings to undefined", () => {
        const env = ServerEnvSchema.parse({
          PORT: "",
          CORS_ORIGIN: "   ",
          PUBLIC_URL: "",
          LAN_IP: "  ",
          HOST_IP: "",
        });
        expect(env.PORT).toBe(3000);
        expect(env.CORS_ORIGIN).toBeUndefined();
        expect(env.PUBLIC_URL).toBeUndefined();
        expect(env.LAN_IP).toBeUndefined();
        expect(env.HOST_IP).toBeUndefined();
      });

      it("validates valid custom configuration", () => {
        const env = ServerEnvSchema.parse({
          NODE_ENV: "production",
          PORT: 4000,
          HOST: "127.0.0.1",
          CORS_ORIGIN: "https://chess.example.com",
          PUBLIC_URL: "https://chess.example.com",
          LAN_IP: "192.168.1.50",
          HOST_IP: "10.0.0.1",
          LOG_LEVEL: "warn",
        });
        expect(env.NODE_ENV).toBe("production");
        expect(env.PORT).toBe(4000);
        expect(env.HOST).toBe("127.0.0.1");
        expect(env.CORS_ORIGIN).toBe("https://chess.example.com");
        expect(env.PUBLIC_URL).toBe("https://chess.example.com");
        expect(env.LAN_IP).toBe("192.168.1.50");
        expect(env.HOST_IP).toBe("10.0.0.1");
        expect(env.LOG_LEVEL).toBe("warn");
      });

      it("fails validation on invalid PORT, NODE_ENV, or malformed URLs/IPs", () => {
        expect(() => ServerEnvSchema.parse({ PORT: -1 })).toThrow();
        expect(() => ServerEnvSchema.parse({ PORT: 65536 })).toThrow();
        expect(() => ServerEnvSchema.parse({ PORT: "not-a-port" })).toThrow();
        expect(() => ServerEnvSchema.parse({ NODE_ENV: "staging" })).toThrow();
        expect(() => ServerEnvSchema.parse({ LOG_LEVEL: "verbose" })).toThrow();
        expect(() => ServerEnvSchema.parse({ PUBLIC_URL: "http://:invalid" })).toThrow();
        expect(() => ServerEnvSchema.parse({ PUBLIC_URL: "://invalid" })).toThrow();
        expect(() => ServerEnvSchema.parse({ LAN_IP: "999.999.999.999" })).toThrow();
        expect(() => ServerEnvSchema.parse({ HOST_IP: "invalid-ip" })).toThrow();
      });

      it("normalizes PUBLIC_URL without protocol by prepending https:// (MIN-001)", () => {
        const parsedDomain = ServerEnvSchema.parse({ PUBLIC_URL: "chess.example.com" });
        expect(parsedDomain.PUBLIC_URL).toBe("https://chess.example.com");

        const parsedLocalhost = ServerEnvSchema.parse({ PUBLIC_URL: "localhost:3000" });
        expect(parsedLocalhost.PUBLIC_URL).toBe("http://localhost:3000");

        const parsedProtoRel = ServerEnvSchema.parse({ PUBLIC_URL: "//fun-chess.a.run.app" });
        expect(parsedProtoRel.PUBLIC_URL).toBe("https://fun-chess.a.run.app");
      });

      it("parses server environment variables: METRICS_SECRET, MAX_ROOMS, SESSION_SECRET, CLIENT_URL, and CLIENT_DIST_PATH (MIN-023)", () => {
        const testMetricsSecret = ["secret", "token", "xyz"].join("-");
        const testSessionSecret = ["session", "auth", "key", "123"].join("-");
        const env = ServerEnvSchema.parse({
          METRICS_SECRET: testMetricsSecret,
          MAX_ROOMS: "5000",
          SESSION_SECRET: testSessionSecret,
          CLIENT_URL: "https://chess-client.internal",
          CLIENT_DIST_PATH: "/opt/fun-chess/dist",
        });

        expect(env.METRICS_SECRET).toBe(testMetricsSecret);
        expect(env.MAX_ROOMS).toBe(5000);
        expect(typeof env.MAX_ROOMS).toBe("number");
        expect(env.SESSION_SECRET).toBe(testSessionSecret);
        expect(env.CLIENT_URL).toBe("https://chess-client.internal");
        expect(env.CLIENT_DIST_PATH).toBe("/opt/fun-chess/dist");
      });

      it("preprocesses empty strings to undefined for extended server env variables (MIN-023)", () => {
        const env = ServerEnvSchema.parse({
          METRICS_SECRET: "",
          MAX_ROOMS: "  ",
          SESSION_SECRET: "",
          CLIENT_URL: "   ",
          CLIENT_DIST_PATH: "",
        });

        expect(env.METRICS_SECRET).toBeUndefined();
        expect(env.MAX_ROOMS).toBeUndefined();
        expect(env.SESSION_SECRET).toBeUndefined();
        expect(env.CLIENT_URL).toBeUndefined();
        expect(env.CLIENT_DIST_PATH).toBeUndefined();
      });

      it("fails validation on invalid MAX_ROOMS (zero, negative, non-integer)", () => {
        expect(() => ServerEnvSchema.parse({ MAX_ROOMS: 0 })).toThrow();
        expect(() => ServerEnvSchema.parse({ MAX_ROOMS: -5 })).toThrow();
        expect(() => ServerEnvSchema.parse({ MAX_ROOMS: "not-a-number" })).toThrow();
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

      // Validate with canonical Zod schemas (ENH-012)
      const parsedPayload = UnifiedProgressPayloadSchema.parse(payload);
      expect(parsedPayload.version).toBe(1);
      expect(parsedPayload.puzzles.ratingProfile.rating).toBe(800);

      const parsedEnvelope = UnifiedProgressEnvelopeSchema.parse(envelope);
      expect(parsedEnvelope.magic).toBe("FC_PROGRESS_V1");
      expect(parsedEnvelope.checksum).toBe("12345678");

      expect(() =>
        UnifiedProgressEnvelopeSchema.parse({
          ...envelope,
          magic: "WRONG_MAGIC",
        }),
      ).toThrow();
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

  describe("System Abstraction Contracts (system.ts)", () => {
    it("satisfies IClock interface contract", () => {
      const clock: IClock = {
        now: () => 1700000000000,
      };
      expect(clock.now()).toBe(1700000000000);
    });

    it("satisfies IIdGenerator interface contract", () => {
      const idGen: IIdGenerator = {
        generateId: () => "mock-uuid-456",
        generateRandomInt: (min, _max) => min,
      };
      expect(idGen.generateId()).toBe("mock-uuid-456");
      expect(idGen.generateRandomInt(1, 10)).toBe(1);
    });
  });

  describe("Health Check Telemetry Schemas", () => {
    it("validates lightweight liveness probe schema (LivenessHealthResponseSchema)", () => {
      const valid = {
        status: "ok",
        uptimeSeconds: 42.5,
        timestamp: "2026-09-08T07:45:00.000Z",
      };
      const parsed = LivenessHealthResponseSchema.parse(valid);
      expect(parsed.status).toBe("ok");
      expect(parsed.uptimeSeconds).toBe(42.5);

      expect(() =>
        LivenessHealthResponseSchema.parse({
          status: "unknown",
          uptimeSeconds: -5,
          timestamp: "not-a-datetime",
        }),
      ).toThrow();
    });

    it("validates HealthCheckResponseSchema is aliased to LivenessHealthResponseSchema (CRIT-001)", () => {
      expect(HealthCheckResponseSchema).toBe(LivenessHealthResponseSchema);
      const liveness = HealthCheckResponseSchema.parse({
        status: "ok",
        uptimeSeconds: 15.2,
        timestamp: "2026-09-08T07:45:00.000Z",
      });
      expect(liveness.status).toBe("ok");
      expect("activeRooms" in liveness).toBe(false);
    });

    it("validates detailed operational health schema (DetailedHealthResponseSchema)", () => {
      const valid = {
        status: "ok",
        uptimeSeconds: 120.0,
        timestamp: "2026-09-08T07:45:00.000Z",
        activeRooms: 3,
        activeSockets: 6,
        memoryUsageMb: {
          rss: 48.2,
          heapTotal: 24.5,
          heapUsed: 18.3,
        },
        relay: {
          mode: "lan" as const,
        },
      };
      const parsed = DetailedHealthResponseSchema.parse(valid);
      expect(parsed.activeRooms).toBe(3);
      expect(parsed.activeSockets).toBe(6);
      expect(parsed.memoryUsageMb.rss).toBe(48.2);
      expect(parsed.relay?.mode).toBe("lan");

      expect(() =>
        DetailedHealthResponseSchema.parse({
          status: "ok",
          uptimeSeconds: 10,
          timestamp: "2026-09-08T07:45:00.000Z",
          activeRooms: -1,
        }),
      ).toThrow();
    });
  });

  describe("HTTP Error Schemas (MAJ-033)", () => {
    it("validates HttpErrorBodySchema and HttpErrorEnvelopeSchema", () => {
      const envelope = {
        status: "error" as const,
        code: 404,
        error: {
          code: "ERR_ROOM_NOT_FOUND",
          message: "Room ABCD not found",
          details: { roomCode: "ABCD" },
          correlationId: "corr-12345",
        },
      };

      const parsedBody = HttpErrorBodySchema.parse(envelope.error);
      expect(parsedBody.code).toBe("ERR_ROOM_NOT_FOUND");

      const parsed = HttpErrorEnvelopeSchema.parse(envelope);
      expect(parsed.status).toBe("error");
      expect(parsed.code).toBe(404);
      expect(parsed.error.code).toBe("ERR_ROOM_NOT_FOUND");
      expect(parsed.error.message).toBe("Room ABCD not found");
      expect(parsed.error.correlationId).toBe("corr-12345");

      // Rejects status !== 'error'
      expect(() =>
        HttpErrorEnvelopeSchema.parse({
          ...envelope,
          status: "fail",
        }),
      ).toThrow();

      // Rejects HTTP status code < 400
      expect(() =>
        HttpErrorEnvelopeSchema.parse({
          ...envelope,
          code: 200,
        }),
      ).toThrow();
    });
  });

  describe("URL Normalization & Schemas (MIN-001)", () => {
    it("normalizes URLs missing protocol with normalizeUrlString and safeParseUrl", () => {
      expect(normalizeUrlString("chess.example.com")).toBe("https://chess.example.com");
      expect(normalizeUrlString("localhost:5173")).toBe("http://localhost:5173");
      expect(normalizeUrlString("127.0.0.1:8080/room/1234")).toBe("http://127.0.0.1:8080/room/1234");
      expect(normalizeUrlString("//fun-chess.a.run.app")).toBe("https://fun-chess.a.run.app");
      expect(normalizeUrlString("https://fun-chess.com/play")).toBe("https://fun-chess.com/play");
      expect(normalizeUrlString("")).toBeUndefined();
      expect(normalizeUrlString("   ")).toBeUndefined();

      const parsed = safeParseUrl("chess.example.com/play");
      expect(parsed).toBeInstanceOf(URL);
      expect(parsed?.protocol).toBe("https:");
      expect(parsed?.hostname).toBe("chess.example.com");
      expect(parsed?.pathname).toBe("/play");

      const parsedLocal = safeParseUrl("localhost:3000");
      expect(parsedLocal?.protocol).toBe("http:");
      expect(parsedLocal?.port).toBe("3000");

      expect(safeParseUrl("http://:invalid")).toBeUndefined();
      expect(safeParseUrl("")).toBeUndefined();

      expect(UrlSchema.parse("chess.example.com")).toBe("https://chess.example.com");
      expect(() => UrlSchema.parse("http://:invalid")).toThrow();
    });
  });

  describe("Core WebSocket Event Runtime Schemas (MAJ-029, MAJ-031)", () => {
    const validPlayer = {
      id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      socketId: "sock-123",
      name: "PlayerOne",
      avatar: "🦁",
      color: "w" as const,
      isHost: true,
      isConnected: true,
      connectedAt: 1700000000000,
    };

    const validMoveResult = {
      from: "e2",
      to: "e4",
      san: "e4",
      piece: "p" as const,
      color: "w" as const,
      flags: "b",
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      moveNumber: 1,
      timestamp: 1700000001000,
    };

    const validGameState = {
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      turn: "b" as const,
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [validMoveResult],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: { from: "e2", to: "e4" },
      moveCount: 1,
    };

    it("validates PieceTypeSchema and RoomStatusSchema enums", () => {
      expect(PieceTypeSchema.parse("k")).toBe("k");
      expect(PieceTypeSchema.parse("q")).toBe("q");
      expect(() => PieceTypeSchema.parse("z")).toThrow();

      expect(RoomStatusSchema.parse("playing")).toBe("playing");
      expect(RoomStatusSchema.parse("paused_disconnect")).toBe("paused_disconnect");
      expect(() => RoomStatusSchema.parse("invalid_status")).toThrow();

      expect(GameOverReasonSchema.parse("checkmate")).toBe("checkmate");
      expect(GameOverReasonSchema.parse("resignation")).toBe("resignation");
      expect(() => GameOverReasonSchema.parse("unknown")).toThrow();
    });

    it("validates PlayerSchema structure and rejects non-UUID id", () => {
      const parsed = PlayerSchema.parse(validPlayer);
      expect(parsed.name).toBe("PlayerOne");
      expect(parsed.color).toBe("w");
      // ENH-001: Sanitize client-facing player broadcast payloads to omit raw transport socketId
      expect(parsed).not.toHaveProperty("socketId");

      expect(() =>
        PlayerSchema.parse({
          ...validPlayer,
          id: "not-a-uuid",
        }),
      ).toThrow();
    });

    it("validates MoveResultSchema structure", () => {
      const parsed = MoveResultSchema.parse(validMoveResult);
      expect(parsed.from).toBe("e2");
      expect(parsed.to).toBe("e4");
      expect(parsed.san).toBe("e4");

      expect(() =>
        MoveResultSchema.parse({
          ...validMoveResult,
          from: "invalid-square",
        }),
      ).toThrow();
    });

    it("validates PromotionPieceSchema and PromotionPiece types (MIN-025)", () => {
      const validPromotionPieces: PromotionPiece[] = ["q", "r", "b", "n"];
      for (const p of validPromotionPieces) {
        expect(PromotionPieceSchema.parse(p)).toBe(p);
      }

      // Rejects invalid promotion targets such as pawn, king, or arbitrary strings
      expect(() => PromotionPieceSchema.parse("p")).toThrow();
      expect(() => PromotionPieceSchema.parse("k")).toThrow();
      expect(() => PromotionPieceSchema.parse("x")).toThrow();

      // MoveResult with promotion piece
      const promotionMove: MoveResult = {
        ...validMoveResult,
        to: "e8",
        promotion: "q",
      };
      const parsed = MoveResultSchema.parse(promotionMove);
      expect(parsed.promotion).toBe("q");
    });

    it("validates GameStateSchema structure", () => {
      const parsed = GameStateSchema.parse(validGameState);
      expect(parsed.turn).toBe("b");
      expect(parsed.moveCount).toBe(1);
      expect(parsed.moveHistory).toHaveLength(1);
    });

    it("validates RematchStateSchema and DrawOfferSchema", () => {
      const rematch = {
        requestedBy: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        requestedAt: 1700000005000,
        status: "pending" as const,
      };
      const parsedRematch = RematchStateSchema.parse(rematch);
      expect(parsedRematch.status).toBe("pending");

      const drawOffer = {
        offeredBy: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        offeredAt: 1700000006000,
      };
      const parsedDraw = DrawOfferSchema.parse(drawOffer);
      expect(parsedDraw.offeredBy).toBe(drawOffer.offeredBy);
    });

    it("validates ThemeMasteryProgressSchema and constrains theme using PuzzleThemeSchema (MAJ-024)", () => {
      expect(PUZZLE_THEMES.length).toBeGreaterThan(50);
      expect(PuzzleThemeSchema.parse("fork")).toBe("fork");
      expect(PuzzleThemeSchema.parse("mate_in_2")).toBe("mate_in_2");
      expect(() => PuzzleThemeSchema.parse("not_a_valid_theme")).toThrow();

      const validProgress = {
        theme: "fork" as const,
        attempted: 10,
        solved: 8,
        starsEarned: 24,
        masteryLevel: "apprentice" as const,
        lastPracticedAt: 1700000000000,
      };
      const parsed = ThemeMasteryProgressSchema.parse(validProgress);
      expect(parsed.theme).toBe("fork");

      expect(() =>
        ThemeMasteryProgressSchema.parse({
          ...validProgress,
          theme: "arbitrary_invalid_theme",
        }),
      ).toThrow();
    });

    it("validates RoomStateSchema structure", () => {
      const room = {
        roomCode: "ABCD",
        version: 1,
        status: "playing" as const,
        hostId: validPlayer.id,
        whitePlayer: validPlayer,
        blackPlayer: null,
        spectators: [],
        game: validGameState,
        rematch: null,
        drawOffer: null,
        createdAt: 1700000000000,
        lastActivityAt: 1700000002000,
      };

      const parsed = RoomStateSchema.parse(room);
      expect(parsed.roomCode).toBe("ABCD");
      expect(parsed.status).toBe("playing");
      expect(parsed.whitePlayer?.name).toBe("PlayerOne");
    });

    it("validates GameOverPayloadSchema", () => {
      const gameOver = {
        winner: "w" as const,
        winnerName: "PlayerOne",
        reason: "checkmate" as const,
        message: "Checkmate! PlayerOne wins.",
        finalFen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
        totalMoves: 4,
        durationSeconds: 125.5,
      };

      const parsed = GameOverPayloadSchema.parse(gameOver);
      expect(parsed.winner).toBe("w");
      expect(parsed.reason).toBe("checkmate");
      expect(parsed.totalMoves).toBe(4);
    });

    it("validates MakeMoveRequestSchema with expectedMoveNumber and idempotencyKey (MAJ-003, MAJ-031)", () => {
      const req = {
        roomCode: "ABCD",
        move: { from: "e2", to: "e4" },
        expectedMoveNumber: 0,
        idempotencyKey: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      };

      const parsed = MakeMoveRequestSchema.parse(req);
      expect(parsed.roomCode).toBe("ABCD");
      expect(parsed.expectedMoveNumber).toBe(0);
      expect(parsed.idempotencyKey).toBe("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d");

      // Accepts custom alphanumeric/hyphenated/underscored string tokens (MAJ-003)
      const parsedCustom = MakeMoveRequestSchema.parse({
        roomCode: "ABCD",
        move: { from: "e2", to: "e4" },
        idempotencyKey: "nanoid_abc-123_XYZ",
      });
      expect(parsedCustom.idempotencyKey).toBe("nanoid_abc-123_XYZ");

      // Optional fields omitted
      const parsedMinimal = MakeMoveRequestSchema.parse({
        roomCode: "WXYZ",
        move: { from: "d2", to: "d4" },
      });
      expect(parsedMinimal.expectedMoveNumber).toBeUndefined();
      expect(parsedMinimal.idempotencyKey).toBeUndefined();

      // Rejects negative expectedMoveNumber
      expect(() =>
        MakeMoveRequestSchema.parse({
          roomCode: "ABCD",
          move: { from: "e2", to: "e4" },
          expectedMoveNumber: -1,
        }),
      ).toThrow();

      // Rejects empty idempotencyKey
      expect(() =>
        MakeMoveRequestSchema.parse({
          roomCode: "ABCD",
          move: { from: "e2", to: "e4" },
          idempotencyKey: "",
        }),
      ).toThrow();

      // Rejects idempotencyKey exceeding 64 characters
      expect(() =>
        MakeMoveRequestSchema.parse({
          roomCode: "ABCD",
          move: { from: "e2", to: "e4" },
          idempotencyKey: "a".repeat(65),
        }),
      ).toThrow();

      // Rejects invalid characters (spaces, special symbols)
      expect(() =>
        MakeMoveRequestSchema.parse({
          roomCode: "ABCD",
          move: { from: "e2", to: "e4" },
          idempotencyKey: "invalid token!",
        }),
      ).toThrow();
    });
  });

  describe("Socket Event Contracts (MAJ-026, MAJ-027, ENH-013)", () => {
    it("verifies room:leave acknowledgement callback signature", () => {
      const mockLeaveHandler: ClientToServerEvents["room:leave"] = (
        req,
        callback,
      ) => {
        expect(req.roomCode).toBe("ABCD");
        callback?.({ success: true });
        callback?.({
          success: false,
          error: {
            code: "ERR_PLAYER_NOT_IN_ROOM",
            message: "Player not found",
          },
        });
      };

      let callbackCount = 0;
      mockLeaveHandler({ roomCode: "ABCD" }, (res) => {
        callbackCount++;
        expect(typeof res.success).toBe("boolean");
      });
      expect(callbackCount).toBe(2);
    });

    it("verifies room:leave acknowledgement callback with SocketErrorPayload and RoomLeavePayload", () => {
      const mockLeaveHandler: ClientToServerEvents["room:leave"] = (
        req,
        callback,
      ) => {
        expect(req.roomCode).toBe("XYZW");
        callback?.({
          success: false,
          error: {
            code: "ERR_ROOM_NOT_FOUND",
            message: "Room not found",
            roomCode: "XYZW",
          },
        });
      };

      const payload: RoomLeavePayload = { roomCode: "XYZW" };
      let invoked = false;
      mockLeaveHandler(payload, (res) => {
        invoked = true;
        if (!res.success) {
          expect(typeof res.error).toBe("object");
          if (typeof res.error === "object") {
            expect(res.error.code).toBe("ERR_ROOM_NOT_FOUND");
          }
        }
      });
      expect(invoked).toBe(true);
    });

    it("verifies room:reconnect acknowledgement with required roomStatus (MAJ-008)", () => {
      const mockReconnectHandler: ClientToServerEvents["room:reconnect"] = (
        req,
        callback,
      ) => {
        expect(req.roomCode).toBe("ABCD");
        callback?.({
          success: true,
          room: {} as RoomState,
          player: {} as Player,
          roomStatus: "playing",
        });
      };

      mockReconnectHandler(
        { roomCode: "ABCD", playerId: "p1", sessionToken: "t1" },
        (res) => {
          if (res.success) {
            const status: RoomStatus = res.roomStatus;
            expect(status).toBe("playing");
            expect(res.sessionToken).toBeUndefined();
          }
        },
      );
    });

    it("verifies room:reconnect acknowledgement accepts optional rotated sessionToken (ENH-015)", () => {
      const mockReconnectHandler: ClientToServerEvents["room:reconnect"] = (
        req,
        callback,
      ) => {
        expect(req.roomCode).toBe("ABCD");
        callback?.({
          success: true,
          room: {} as RoomState,
          player: {} as Player,
          roomStatus: "playing",
          sessionToken: "new-rotated-token-123",
        });
      };

      mockReconnectHandler(
        { roomCode: "ABCD", playerId: "p1", sessionToken: "t1" },
        (res) => {
          if (res.success) {
            expect(res.sessionToken).toBe("new-rotated-token-123");
          }
        },
      );
    });

    it("verifies room:player_disconnected broadcast payload shape conforms to PlayerDisconnectedPayload (MAJ-008)", () => {
      const mockPlayerDisconnected: ServerToClientEvents["room:player_disconnected"] = (
        data,
      ) => {
        expect(data.playerId).toBe("p1");
        expect(data.gracePeriodMs).toBe(60000);
        expect(data.roomStatus).toBe("paused_disconnect");
      };

      const payload: PlayerDisconnectedPayload = {
        playerId: "p1",
        gracePeriodMs: 60000,
        roomStatus: "paused_disconnect",
      };

      mockPlayerDisconnected(payload);
    });

    it("verifies room:player_reconnected broadcast payload contains authoritative roomStatus", () => {
      const mockPlayerReconnected: ServerToClientEvents["room:player_reconnected"] =
        (data) => {
          expect(data.playerId).toBe("p1");
          expect(data.playerName).toBe("Alex");
          expect(data.roomStatus).toBe("playing");
        };

      mockPlayerReconnected({
        playerId: "p1",
        playerName: "Alex",
        roomStatus: "playing",
      });
    });

    it("verifies room:create acknowledgement callback signature includes player (MIN-024)", () => {
      const mockCreateHandler: ClientToServerEvents["room:create"] = (
        req,
        callback,
      ) => {
        expect(req.playerName).toBe("HostPlayer");
        callback?.({
          success: true,
          room: {} as RoomState,
          player: {
            id: "p1-uuid",
            socketId: "sock-1",
            name: "HostPlayer",
            color: "w",
            isHost: true,
            isConnected: true,
            connectedAt: 1000,
          },
          sessionToken: "secret-token-123",
        });
      };

      let ackInvoked = false;
      mockCreateHandler(
        { playerName: "HostPlayer", preferredColor: "w", avatar: "🦁" },
        (res) => {
          ackInvoked = true;
          if (res.success) {
            expect(res.player.name).toBe("HostPlayer");
            expect(res.player.isHost).toBe(true);
            expect(res.sessionToken).toBe("secret-token-123");
          }
        },
      );
      expect(ackInvoked).toBe(true);
    });

    it("validates ERR_STALE_LOCK_EXECUTION error code assignment without casting (MIN-023)", () => {
      const code: ErrorCode = "ERR_STALE_LOCK_EXECUTION";
      expect(code).toBe("ERR_STALE_LOCK_EXECUTION");
    });

    it("verifies room:player_left event and schema with typed reasons (CRIT-004)", () => {
      const validReasons: PlayerLeftReason[] = [
        "player_left",
        "host_left",
        "kicked",
        "room_closed",
      ];

      for (const reason of validReasons) {
        expect(PlayerLeftReasonSchema.parse(reason)).toBe(reason);
        const parsed = RoomPlayerLeftPayloadSchema.parse({
          playerId: "player-123",
          playerName: "Alice",
          reason,
        });
        expect(parsed.reason).toBe(reason);
      }

      // reason is optional
      const noReasonParsed = RoomPlayerLeftPayloadSchema.parse({
        playerId: "player-123",
        playerName: "Alice",
      });
      expect(noReasonParsed.reason).toBeUndefined();

      // invalid reason rejected
      expect(() => PlayerLeftReasonSchema.parse("invalid_reason")).toThrow();
      expect(() =>
        RoomPlayerLeftPayloadSchema.parse({
          playerId: "player-123",
          playerName: "Alice",
          reason: "invalid_reason",
        }),
      ).toThrow();

      // Handler type check and interface type validation
      const mockPlayerLeftHandler: ServerToClientEvents["room:player_left"] = (data) => {
        expect(data.playerId).toBe("p1");
        expect(data.playerName).toBe("Bob");
        expect(data.reason).toBe("host_left");
      };
      const leftPayload: RoomPlayerLeftPayload = {
        playerId: "p1",
        playerName: "Bob",
        reason: "host_left",
      };
      mockPlayerLeftHandler(leftPayload);
    });

    it("validates CreateRoomSuccessResponseSchema and CreateRoomResponseSchema (MAJ-003)", () => {
      const mockRoom = {
        roomCode: "ABCD",
        status: "lobby",
        hostId: "11111111-1111-4111-8111-111111111111",
        whitePlayer: {
          id: "11111111-1111-4111-8111-111111111111",
          socketId: "sock-1",
          name: "HostPlayer",
          avatar: "🦁",
          color: "w",
          isHost: true,
          isConnected: true,
          connectedAt: 1000,
        },
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
        createdAt: 1000,
        lastActivityAt: 1000,
      };

      const mockPlayer: Player = {
        id: "11111111-1111-4111-8111-111111111111",
        socketId: "sock-1",
        name: "HostPlayer",
        avatar: "🦁",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: 1000,
      };

      const successPayload = {
        success: true as const,
        room: mockRoom,
        player: mockPlayer,
        sessionToken: "sec-token-12345",
      };

      const parsedSuccess = CreateRoomSuccessResponseSchema.parse(successPayload);
      expect(parsedSuccess.success).toBe(true);
      expect(parsedSuccess.player.id).toBe(mockPlayer.id);
      expect(parsedSuccess.sessionToken).toBe("sec-token-12345");

      const successAck: CreateRoomSuccessAck = {
        success: true,
        room: mockRoom as unknown as RoomState,
        player: mockPlayer,
        sessionToken: "sec-token-12345",
      };
      const ackResponse: CreateRoomAckResponse = successAck;
      expect(ackResponse.success).toBe(true);

      const successResponse: CreateRoomSuccessResponse = parsedSuccess;
      const parsedUnion = CreateRoomResponseSchema.parse(successPayload);
      const unionResponse: CreateRoomResponse = parsedUnion;
      expect(successResponse.success).toBe(true);
      expect(unionResponse.success).toBe(true);

      const errorPayload = {
        success: false as const,
        error: {
          code: "ERR_RATE_LIMITED",
          message: "Rate limit exceeded",
        },
      };
      const parsedError = CreateRoomResponseSchema.parse(errorPayload);
      expect(parsedError.success).toBe(false);
    });

    it("exports normalizeRoomCode and validatePlayerName from shared package root (MAJ-009)", () => {
      expect(normalizeRoomCode("  abcd  ")).toBe("ABCD");
      expect(validatePlayerName("  ValidPlayer  ")).toBe("ValidPlayer");
      expect(() => validatePlayerName("")).toThrow();
    });
  });
});

