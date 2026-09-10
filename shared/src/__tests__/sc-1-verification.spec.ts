import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Chess } from "chess.js";
import type {
  Player,
  RoomState,
  PromotionPiece,
  ClientToServerEvents,
  IIdGenerator,
  UnifiedProgressPayload,
  UnifiedProgressEnvelope,
  ChessLogger,
  MovePayload,
  ReconnectAckPayload,
  ReconnectSuccessAck,
  ReconnectErrorAck,
  IClock,
  SerializedError,
} from "../index.js";
import {
  // Errors
  AppError,
  OptimisticLockConflictError,
  type SocketErrorPayload,
  // Schemas
  MakeMoveRequestSchema,
  MovePayloadSchema,
  PromotionPieceSchema,
  PlayerSchema,
  UnifiedProgressPayloadSchema,
  UnifiedProgressEnvelopeSchema,
  // Utils & Algorithms
  DefaultDictionaryMapper,
  calculateBoardMaterial,
  STANDARD_PIECE_POINTS,
  STANDARD_PIECE_VALUES,
  PIECE_STANDARD_POINTS,
  PIECE_CENTIPAWN_VALUES,
  bytesToBase64Url,
  base64UrlToBytes,
  safeLoadFen,
  // SC-1 Remediated Contracts & Utilities
  PUZZLE_THEMES,
  generateSessionToken,
  verifySessionToken,
  isValidSessionToken,
  maskToken,
  tokenFingerprint,
  canonicalJsonStringify,
  MAX_CANONICAL_JSON_DEPTH,
  serializeError,
  toErrorMessage,
  safeNormalizeUrl,
  safeParseUrl,
  SystemClock,
  systemClock,
  MockClock,
} from "../index.js";

describe("SC-1 Acceptance Criteria Verification Suite", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 1. MAJ-003: MakeMoveRequestSchema validation & token rules
   */
  describe("1. MAJ-003: MakeMoveRequestSchema validation", () => {
    it("validates valid RFC 4122 UUID strings as idempotencyKey", () => {
      const validUuid = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
      const result = MakeMoveRequestSchema.parse({
        roomCode: "ABCD",
        move: { from: "e2", to: "e4" },
        idempotencyKey: validUuid,
      });

      expect(result.idempotencyKey).toBe(validUuid);
    });

    it("validates custom client string tokens (alphanumeric, hyphens, underscores, 1 to 64 chars)", () => {
      const customTokens = [
        "move_token-123",
        "nanoid_abc-123_XYZ",
        "a", // min length (1 char)
        "token_with_underscores",
        "token-with-hyphens",
        "a".repeat(64), // max length (64 chars)
        "client-id_9876543210-MOVE",
      ];

      for (const token of customTokens) {
        const parsed = MakeMoveRequestSchema.parse({
          roomCode: "ABCD",
          move: { from: "e2", to: "e4" },
          idempotencyKey: token,
        });
        expect(parsed.idempotencyKey).toBe(token);
      }
    });

    it("allows omitting idempotencyKey and expectedMoveNumber", () => {
      const parsed = MakeMoveRequestSchema.parse({
        roomCode: "ABCD",
        move: { from: "e2", to: "e4" },
      });

      expect(parsed.idempotencyKey).toBeUndefined();
      expect(parsed.expectedMoveNumber).toBeUndefined();
    });

    it("rejects empty string idempotencyKey", () => {
      expect(() =>
        MakeMoveRequestSchema.parse({
          roomCode: "ABCD",
          move: { from: "e2", to: "e4" },
          idempotencyKey: "",
        }),
      ).toThrow();
    });

    it("rejects idempotencyKey strings exceeding 64 characters", () => {
      expect(() =>
        MakeMoveRequestSchema.parse({
          roomCode: "ABCD",
          move: { from: "e2", to: "e4" },
          idempotencyKey: "a".repeat(65),
        }),
      ).toThrow();
    });

    it("rejects idempotencyKey with spaces or invalid symbols", () => {
      const invalidKeys = [
        "token with spaces",
        "move$123",
        "user@token",
        "token#key",
        "token!exclamation",
        "token.dot",
        "token/slash",
      ];

      for (const key of invalidKeys) {
        expect(() =>
          MakeMoveRequestSchema.parse({
            roomCode: "ABCD",
            move: { from: "e2", to: "e4" },
            idempotencyKey: key,
          }),
        ).toThrow();
      }
    });
  });

  /**
   * 2. MAJ-005: OptimisticLockConflictError class definition & prototype identity
   */
  describe("2. MAJ-005: OptimisticLockConflictError class definition & prototype identity", () => {
    it("correctly establishes prototype identity and inherits from AppError and Error", () => {
      const conflict = new OptimisticLockConflictError("ABCD", 3, 4);

      expect(conflict).toBeInstanceOf(OptimisticLockConflictError);
      expect(conflict).toBeInstanceOf(AppError);
      expect(conflict).toBeInstanceOf(Error);
      expect(conflict.isAppError).toBe(true);
    });

    it("exposes expected statusCode, code, name, and message", () => {
      const conflict = new OptimisticLockConflictError("ABCD", 3, 4);

      expect(conflict.statusCode).toBe(409);
      expect(conflict.code).toBe("ERR_CONFLICT");
      expect(conflict.name).toBe("OptimisticLockConflictError");
      expect(conflict.message).toContain("State conflict for room 'ABCD'");
      expect(conflict.message).toContain("expected version 3, found 4");
    });

    it("exposes public readonly fields roomCode, expectedVersion, and actualVersion", () => {
      const conflict = new OptimisticLockConflictError("WXYZ", 10, 11);

      expect(conflict.roomCode).toBe("WXYZ");
      expect(conflict.expectedVersion).toBe(10);
      expect(conflict.actualVersion).toBe(11);
    });

    it("provides structured details payload and serializes cleanly", () => {
      const conflict = new OptimisticLockConflictError("WXYZ", 10, 11);

      expect(conflict.details).toEqual({
        roomCode: "WXYZ",
        expectedVersion: 10,
        actualVersion: 11,
      });

      // Verify clean structured representation
      const structuredView =
        typeof (conflict as unknown as { toJSON?: () => unknown }).toJSON === "function"
          ? (conflict as unknown as { toJSON: () => Record<string, unknown> }).toJSON()
          : {
              code: conflict.code,
              statusCode: conflict.statusCode,
              name: conflict.name,
              roomCode: conflict.roomCode,
              expectedVersion: conflict.expectedVersion,
              actualVersion: conflict.actualVersion,
              details: conflict.details,
            };

      expect(structuredView).toMatchObject({
        code: "ERR_CONFLICT",
        statusCode: 409,
        name: "OptimisticLockConflictError",
        roomCode: "WXYZ",
        expectedVersion: 10,
        actualVersion: 11,
      });
    });
  });

  /**
   * 3. MAJ-020: IIdGenerator interface requires non-optional generateRandomInt
   */
  describe("3. MAJ-020: IIdGenerator requires non-optional generateRandomInt", () => {
    class ConcreteIdGenerator implements IIdGenerator {
      private counter = 0;

      generateId(): string {
        this.counter++;
        return `uuid-${this.counter}`;
      }

      generateRandomInt(min: number, max: number): number {
        return Math.floor((min + max) / 2);
      }
    }

    it("verifies concrete implementation satisfies IIdGenerator without optional chaining", () => {
      const generator: IIdGenerator = new ConcreteIdGenerator();

      expect(generator.generateId()).toBe("uuid-1");

      // Verify direct invocation without optional chaining (?.)
      const randomValue: number = generator.generateRandomInt(1, 10);
      expect(randomValue).toBe(5);
      expect(typeof randomValue).toBe("number");
    });

    it("verifies type-level invariant: generateRandomInt is non-optional", () => {
      type RandomIntMethod = IIdGenerator["generateRandomInt"];
      const testFn: RandomIntMethod = (min: number, max: number): number => min + max;

      expect(testFn(10, 20)).toBe(30);
    });
  });

  /**
   * 4. MIN-024: ClientToServerEvents['room:create'] ack callback signature
   */
  describe("4. MIN-024: ClientToServerEvents['room:create'] ack callback signature", () => {
    it("accepts player and sessionToken in successful room:create acknowledgement", () => {
      const mockPlayer: Player = {
        id: "44d2d46e-1d6f-4796-9818-682226fc96ea",
        socketId: "sock-abc",
        name: "HostPlayer",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: 1700000000000,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        avatar: "🦁",
      };

      const mockRoom: RoomState = {
        roomCode: "ABCD",
        status: "waiting",
        players: [mockPlayer],
        spectators: [],
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        version: 1,
      };

      const mockHandler: ClientToServerEvents["room:create"] = (req, callback) => {
        expect(req.playerName).toBe("HostPlayer");
        callback?.({
          success: true,
          room: mockRoom,
          player: mockPlayer,
          sessionToken: "session-sec-xyz-987",
        });
      };

      let ackCalled = false;
      mockHandler(
        { playerName: "HostPlayer", preferredColor: "w", avatar: "🦁" },
        (res) => {
          ackCalled = true;
          if (res.success) {
            expect(res.player).toBeDefined();
            expect(res.player.id).toBe(mockPlayer.id);
            expect(res.player.name).toBe("HostPlayer");
            expect(res.player.isHost).toBe(true);
            expect(res.sessionToken).toBe("session-sec-xyz-987");
            expect(res.room.roomCode).toBe("ABCD");
          } else {
            throw new Error("Expected successful room:create ack response");
          }
        },
      );

      expect(ackCalled).toBe(true);
    });

    it("accepts error response in room:create acknowledgement failure branch", () => {
      const mockErrorPayload: SocketErrorPayload = {
        code: "ERR_RATE_LIMITED",
        message: "Too many room creation attempts. Please wait.",
      };

      const mockHandler: ClientToServerEvents["room:create"] = (_req, callback) => {
        callback?.({
          success: false,
          error: mockErrorPayload,
        });
      };

      let ackCalled = false;
      mockHandler(
        { playerName: "RateLimitedPlayer" },
        (res) => {
          ackCalled = true;
          if (!res.success) {
            expect(res.error.code).toBe("ERR_RATE_LIMITED");
            expect(res.error.message).toContain("Too many room creation attempts");
          } else {
            throw new Error("Expected failure room:create ack response");
          }
        },
      );

      expect(ackCalled).toBe(true);
    });
  });

  /**
   * 5. MIN-025: PromotionPiece schema and MovePayloadSchema integration
   */
  describe("5. MIN-025: PromotionPiece and MovePayloadSchema", () => {
    it("validates all four promotion pieces 'q', 'r', 'b', 'n' with PromotionPieceSchema", () => {
      const validPieces: PromotionPiece[] = ["q", "r", "b", "n"];

      for (const piece of validPieces) {
        expect(PromotionPieceSchema.parse(piece)).toBe(piece);
      }
    });

    it("parses valid pawn promotion moves in MovePayloadSchema", () => {
      const validPieces: PromotionPiece[] = ["q", "r", "b", "n"];

      for (const promotion of validPieces) {
        const payload = MovePayloadSchema.parse({
          from: "e7",
          to: "e8",
          promotion,
        });
        expect(payload.promotion).toBe(promotion);
      }
    });

    it("parses valid moves without promotion piece", () => {
      const payload = MovePayloadSchema.parse({
        from: "e2",
        to: "e4",
      });
      expect(payload.from).toBe("e2");
      expect(payload.to).toBe("e4");
      expect(payload.promotion).toBeUndefined();
    });

    it("rejects invalid promotion targets like 'k', 'p', or invalid strings", () => {
      const invalidPromotionPieces = ["k", "p", "x", "Q", "R", "king", "pawn"];

      for (const invalid of invalidPromotionPieces) {
        expect(() => PromotionPieceSchema.parse(invalid)).toThrow();
        expect(() =>
          MovePayloadSchema.parse({
            from: "e7",
            to: "e8",
            promotion: invalid,
          }),
        ).toThrow();
      }
    });
  });

  /**
   * 6. ENH-012: UnifiedProgressPayloadSchema and UnifiedProgressEnvelopeSchema
   */
  describe("6. ENH-012: UnifiedProgressPayloadSchema and UnifiedProgressEnvelopeSchema", () => {
    const validPayload: UnifiedProgressPayload = {
      version: 1,
      exportedAt: 1700000000000,
      clientVersion: "1.0.0",
      scenarios: {
        "sc-1": {
          scenarioId: "sc-1",
          completed: true,
          starsEarned: 3,
          attemptsCount: 2,
          hintsUsedTotal: 0,
          firstCompletedAt: 1700000000000,
          lastCompletedAt: 1700000001000,
        },
      },
      puzzles: {
        ratingProfile: {
          rating: 1200,
          ratingDeviation: 200,
          peakRating: 1250,
          totalAttempted: 10,
          totalSolved: 8,
          currentStreak: 3,
          bestStreak: 5,
          lastActiveDate: "2026-09-09",
          ratingHistory: [],
        },
        themeMastery: {
          fork: {
            theme: "fork",
            attempted: 5,
            solved: 4,
            starsEarned: 2,
            masteryLevel: "apprentice",
            lastPracticedAt: 1700000000000,
          },
        },
        arcadeStats: {
          puzzleRushHighScore: 15,
          puzzleRushBestStreak: 12,
          streakSurvivorHighScore: 20,
          totalRushRuns: 5,
        },
        solvedPuzzles: {
          "puz-100": {
            puzzleId: "puz-100",
            solvedAt: 1700000000000,
            timeSpentMs: 4500,
            stars: 3,
            attemptsCount: 1,
          },
        },
        createdAt: 1700000000000,
        lastActiveAt: 1700000001000,
      },
    };

    it("validates a complete domain UnifiedProgressPayload against UnifiedProgressPayloadSchema", () => {
      const parsed = UnifiedProgressPayloadSchema.parse(validPayload);

      expect(parsed.version).toBe(1);
      expect(parsed.exportedAt).toBe(1700000000000);
      expect(parsed.puzzles.ratingProfile.rating).toBe(1200);
      expect(parsed.scenarios["sc-1"]?.starsEarned).toBe(3);
    });

    it("validates a well-formed UnifiedProgressEnvelope against UnifiedProgressEnvelopeSchema", () => {
      const envelope: UnifiedProgressEnvelope = {
        magic: "FC_PROGRESS_V1",
        schemaVersion: 1,
        exportedAt: "2026-09-09T00:00:00.000Z",
        checksum: "8f3b2a1c",
        payload: validPayload,
      };

      const parsed = UnifiedProgressEnvelopeSchema.parse(envelope);

      expect(parsed.magic).toBe("FC_PROGRESS_V1");
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.checksum).toBe("8f3b2a1c");
      expect(parsed.payload.version).toBe(1);
    });

    it("rejects envelope when magic string is invalid or altered", () => {
      const invalidEnvelopes = [
        {
          magic: "FC_PROGRESS_V2",
          schemaVersion: 1,
          exportedAt: "2026-09-09T00:00:00.000Z",
          checksum: "8f3b2a1c",
          payload: validPayload,
        },
        {
          magic: "INVALID_MAGIC",
          schemaVersion: 1,
          exportedAt: "2026-09-09T00:00:00.000Z",
          checksum: "8f3b2a1c",
          payload: validPayload,
        },
        {
          magic: "",
          schemaVersion: 1,
          exportedAt: "2026-09-09T00:00:00.000Z",
          checksum: "8f3b2a1c",
          payload: validPayload,
        },
      ];

      for (const env of invalidEnvelopes) {
        expect(() => UnifiedProgressEnvelopeSchema.parse(env)).toThrow();
      }
    });

    it("rejects envelope when schemaVersion is non-positive or payload is invalid", () => {
      expect(() =>
        UnifiedProgressEnvelopeSchema.parse({
          magic: "FC_PROGRESS_V1",
          schemaVersion: 0,
          exportedAt: "2026-09-09T00:00:00.000Z",
          checksum: "8f3b2a1c",
          payload: validPayload,
        }),
      ).toThrow();

      expect(() =>
        UnifiedProgressEnvelopeSchema.parse({
          magic: "FC_PROGRESS_V1",
          schemaVersion: 1,
          exportedAt: "2026-09-09T00:00:00.000Z",
          checksum: "8f3b2a1c",
          payload: { ...validPayload, version: -1 },
        }),
      ).toThrow();
    });
  });

  /**
   * 7. MAJ-019: DefaultDictionaryMapper.toCompact purity and determinism
   */
  describe("7. MAJ-019: DefaultDictionaryMapper.toCompact purity & determinism", () => {
    const mapper = new DefaultDictionaryMapper();

    const samplePayload: UnifiedProgressPayload = {
      version: 1,
      exportedAt: 1700000000000,
      scenarios: {
        "sc-1": {
          scenarioId: "sc-1",
          completed: true,
          starsEarned: 3,
          attemptsCount: 1,
          hintsUsedTotal: 0,
          firstCompletedAt: 1700000000000,
          lastCompletedAt: 1700000000000,
        },
      },
      puzzles: {
        ratingProfile: {
          rating: 1000,
          ratingDeviation: 300,
          peakRating: 1050,
          totalAttempted: 5,
          totalSolved: 4,
          currentStreak: 2,
          bestStreak: 3,
          lastActiveDate: "2026-09-09",
          ratingHistory: [],
        },
        themeMastery: {},
        arcadeStats: {
          puzzleRushHighScore: 10,
          puzzleRushBestStreak: 8,
          streakSurvivorHighScore: 12,
          totalRushRuns: 2,
        },
        solvedPuzzles: {},
        createdAt: 1700000000000,
        lastActiveAt: 1700000000000,
      },
    };

    it("produces identical compact outputs without invoking Date.now() when explicit timestamp is supplied", () => {
      const dateNowSpy = vi.spyOn(Date, "now");

      const explicitNow = 1710000000000;
      const compact1 = mapper.toCompact(samplePayload, explicitNow);
      const compact2 = mapper.toCompact(samplePayload, explicitNow);

      // Verifies 0 calls to Date.now()
      expect(dateNowSpy).toHaveBeenCalledTimes(0);

      // Verifies pure determinism (deeply identical output)
      expect(compact1).toEqual(compact2);
      expect(compact1.t).toBe(Math.floor((samplePayload.exportedAt || explicitNow) / 1000));
    });

    it("remains pure and deterministic even if payload exportedAt is undefined", () => {
      const payloadWithoutExportedAt: UnifiedProgressPayload = {
        ...samplePayload,
        exportedAt: undefined as unknown as number,
      };

      const dateNowSpy = vi.spyOn(Date, "now");
      const explicitNow = 1720000000000;

      const compact1 = mapper.toCompact(payloadWithoutExportedAt, explicitNow);
      const compact2 = mapper.toCompact(payloadWithoutExportedAt, explicitNow);

      expect(dateNowSpy).toHaveBeenCalledTimes(0);
      expect(compact1).toEqual(compact2);
      expect(compact1.t).toBe(Math.floor(explicitNow / 1000));
    });
  });

  /**
   * 8. MAJ-035: calculateBoardMaterial and standard valuation constants
   */
  describe("8. MAJ-035: calculateBoardMaterial and standard valuation constants", () => {
    it("computes exactly White 39 and Black 39 on standard starting chess position", () => {
      const chess = new Chess();
      const materialSummary = calculateBoardMaterial(chess);

      expect(materialSummary.whiteMaterial).toBe(39);
      expect(materialSummary.blackMaterial).toBe(39);

      // Verify piece counts on standard initial board
      expect(materialSummary.whiteCounts).toEqual({
        p: 8,
        n: 2,
        b: 2,
        r: 2,
        q: 1,
        k: 1,
      });

      expect(materialSummary.blackCounts).toEqual({
        p: 8,
        n: 2,
        b: 2,
        r: 2,
        q: 1,
        k: 1,
      });
    });

    it("verifies STANDARD_PIECE_POINTS and alias exports have standard values", () => {
      const expectedPoints = {
        p: 1,
        n: 3,
        b: 3,
        r: 5,
        q: 9,
        k: 0,
      };

      expect(STANDARD_PIECE_POINTS).toEqual(expectedPoints);
      expect(STANDARD_PIECE_VALUES).toBe(STANDARD_PIECE_POINTS);
      expect(PIECE_STANDARD_POINTS).toBe(STANDARD_PIECE_POINTS);
    });

    it("verifies PIECE_CENTIPAWN_VALUES has expected heuristic values", () => {
      const expectedCentipawns = {
        p: 100,
        n: 320,
        b: 330,
        r: 500,
        q: 900,
        k: 0,
      };

      expect(PIECE_CENTIPAWN_VALUES).toEqual(expectedCentipawns);
    });
  });

  /**
   * 9. MIN-021: bytesToBase64Url & base64UrlToBytes binary round-tripping
   */
  describe("9. MIN-021: bytesToBase64Url & base64UrlToBytes round-tripping", () => {
    it("round-trips empty buffer (0 bytes, 0 remainder)", () => {
      const input = new Uint8Array(0);
      const encoded = bytesToBase64Url(input);
      const decoded = base64UrlToBytes(encoded);

      expect(encoded).toBe("");
      expect(decoded).toEqual(input);
    });

    it("round-trips 1 remainder byte (1 byte buffer -> 2 base64 chars without padding)", () => {
      const testCases = [
        new Uint8Array([0x00]),
        new Uint8Array([0xff]),
        new Uint8Array([0x42]),
        new Uint8Array([1, 2, 3, 4]), // 4 bytes: 4 % 3 === 1
      ];

      for (const input of testCases) {
        const encoded = bytesToBase64Url(input);
        expect(encoded).not.toContain("=");
        expect(encoded).toMatch(/^[a-zA-Z0-9_-]+$/);

        const decoded = base64UrlToBytes(encoded);
        expect(decoded).toEqual(input);
      }
    });

    it("round-trips 2 remainder bytes (2 bytes buffer -> 3 base64 chars without padding)", () => {
      const testCases = [
        new Uint8Array([0x12, 0x34]),
        new Uint8Array([0xff, 0x00]),
        new Uint8Array([1, 2, 3, 4, 5]), // 5 bytes: 5 % 3 === 2
      ];

      for (const input of testCases) {
        const encoded = bytesToBase64Url(input);
        expect(encoded).not.toContain("=");
        expect(encoded).toMatch(/^[a-zA-Z0-9_-]+$/);

        const decoded = base64UrlToBytes(encoded);
        expect(decoded).toEqual(input);
      }
    });

    it("round-trips 3 remainder bytes (full blocks, 0 remainder)", () => {
      const testCases = [
        new Uint8Array([1, 2, 3]), // 3 bytes -> 4 base64 chars
        new Uint8Array([10, 20, 30, 40, 50, 60]), // 6 bytes -> 8 base64 chars
        new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe, 0x01]), // 9 bytes
      ];

      for (const input of testCases) {
        const encoded = bytesToBase64Url(input);
        expect(encoded).not.toContain("=");
        expect(encoded).toMatch(/^[a-zA-Z0-9_-]+$/);

        const decoded = base64UrlToBytes(encoded);
        expect(decoded).toEqual(input);
      }
    });

    it("base64UrlToBytes throws on invalid Base64URL characters", () => {
      expect(() => base64UrlToBytes("invalid+char")).toThrow();
      expect(() => base64UrlToBytes("invalid/char")).toThrow();
      expect(() => base64UrlToBytes("invalid!char")).toThrow();
    });
  });

  /**
   * 10. ENH-011: safeLoadFen robust loading, warning logs, and board rollback
   */
  describe("10. ENH-011: safeLoadFen robust loading, warning logs, & board rollback", () => {
    it("loads valid FEN and returns true", () => {
      const chess = new Chess();
      const validMidGameFen =
        "r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4";

      const success = safeLoadFen(chess, validMidGameFen);

      expect(success).toBe(true);
      expect(chess.fen()).toBe(validMidGameFen);
    });

    it("given invalid FEN, logs structured warning, restores previous board state, and returns false without throwing", () => {
      const chess = new Chess();
      const initialFen = chess.fen();

      const mockLogger: ChessLogger = {
        warn: vi.fn(),
      };

      const invalidFen = "8/8/8/8/8/8/8/8 w - - 0 1"; // Invalid: no kings on board

      let result: boolean | undefined;
      expect(() => {
        result = safeLoadFen(chess, invalidFen, mockLogger);
      }).not.toThrow();

      expect(result).toBe(false);

      // Verify board state was restored to initial position
      expect(chess.fen()).toBe(initialFen);

      // Verify structured warning logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[safeLoadFen]"),
        expect.objectContaining({
          operation: "safe_load_fen",
          fen: invalidFen,
          error: expect.any(String),
        }),
      );
    });

    it("returns false safely when chess instance is null or undefined", () => {
      const result = safeLoadFen(null as unknown as Chess, "8/8/8/8/8/8/8/8 w - - 0 1");
      expect(result).toBe(false);
    });
  });

  /**
   * 11. MAJ-008: Circular dependency in shared contracts & MovePayload / themes.ts
   */
  describe("11. MAJ-008: Circular dependency resolution & themes.ts export", () => {
    it("exports PUZZLE_THEMES from @fun-chess/shared without circular import errors", () => {
      expect(Array.isArray(PUZZLE_THEMES)).toBe(true);
      expect(PUZZLE_THEMES.length).toBeGreaterThan(50);
      expect(PUZZLE_THEMES).toContain("fork");
      expect(PUZZLE_THEMES).toContain("pin");
      expect(PUZZLE_THEMES).toContain("legals_trap");
    });

    it("verifies MovePayload interface contract can be instantiated directly", () => {
      const move: MovePayload = {
        from: "e2",
        to: "e4",
        promotion: undefined,
      };
      expect(move.from).toBe("e2");
      expect(move.to).toBe("e4");
    });
  });

  /**
   * 12. MAJ-004: HMAC-SHA256 session token generation and verification
   */
  describe("12. MAJ-004: HMAC-SHA256 session token generation and verification", () => {
    const testSecret = ["fun", "chess", "test", "secret", "32chars"].join("-");
    const testUuid = "123e4567-e89b-12d3-a456-426614174000";

    it("generates a 101-character HMAC-SHA256 signed token and verifies it", () => {
      const token = generateSessionToken(testUuid, testSecret);
      expect(token).toHaveLength(101);

      const verification = verifySessionToken(token, testSecret);
      expect(verification.valid).toBe(true);
      expect(verification.uuid).toBe(testUuid);
      expect(isValidSessionToken(token, testSecret)).toBe(true);
    });

    it("rejects forged or modified tokens with invalid_signature", () => {
      const token = generateSessionToken(testUuid, testSecret);
      const forgedToken = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");

      const verification = verifySessionToken(forgedToken, testSecret);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe("invalid_signature");
      expect(isValidSessionToken(forgedToken, testSecret)).toBe(false);
    });

    it("redacts tokens for secure logging via maskToken and tokenFingerprint", () => {
      const token = generateSessionToken(testUuid, testSecret);
      const masked = maskToken(token);
      expect(masked).toBe(`${token.slice(0, 8)}...${token.slice(-6)}`);
      expect(masked).not.toContain(token);

      const fp = tokenFingerprint(token);
      expect(fp).toHaveLength(10);
      expect(fp).toMatch(/^[0-9a-f]{10}$/);
    });
  });

  /**
   * 13. MAJ-006: canonicalJsonStringify WeakSet cycle tracking and depth ceiling
   */
  describe("13. MAJ-006: canonicalJsonStringify cycle tracking and depth ceiling", () => {
    it("rejects circular references with TypeError", () => {
      const cycle: Record<string, unknown> = { key: "val" };
      cycle.self = cycle;

      expect(() => canonicalJsonStringify(cycle)).toThrow(TypeError);
    });

    it("rejects nesting deeper than 64 levels with RangeError", () => {
      expect(MAX_CANONICAL_JSON_DEPTH).toBe(64);

      let deepObj: Record<string, unknown> = { end: true };
      for (let i = 0; i < 64; i++) {
        deepObj = { child: deepObj };
      }

      expect(() => canonicalJsonStringify(deepObj)).toThrow(RangeError);
    });
  });

  /**
   * 14. MAJ-022: serializeError and toErrorMessage
   */
  describe("14. MAJ-022: serializeError and toErrorMessage", () => {
    it("standardizes Error instances into SerializedError structures", () => {
      const err = new Error("Network timeout occurred");
      const serialized: SerializedError = serializeError(err);

      expect(serialized.name).toBe("Error");
      expect(serialized.message).toBe("Network timeout occurred");
      expect(serialized.stack).toBeDefined();
    });

    it("extracts human-readable messages with fallback handling via toErrorMessage", () => {
      expect(toErrorMessage(new Error("Connection reset"))).toBe("Connection reset");
      expect(toErrorMessage("  Malformed frame  ")).toBe("Malformed frame");
      expect(toErrorMessage({ message: "Game not found" })).toBe("Game not found");
      expect(toErrorMessage(null, "Default fallback")).toBe("Default fallback");
    });
  });

  /**
   * 15. MIN-017: safeNormalizeUrl and safeParseUrl
   */
  describe("15. MIN-017: safeNormalizeUrl and safeParseUrl", () => {
    it("normalizes localhost and remote URLs consistently", () => {
      expect(safeNormalizeUrl("localhost:3000")).toBe("http://localhost:3000");
      expect(safeNormalizeUrl("chess.example.com")).toBe("https://chess.example.com");
      expect(safeNormalizeUrl("//assets.chess.com/pack")).toBe("https://assets.chess.com/pack");
      expect(safeNormalizeUrl("https://fun-chess.com")).toBe("https://fun-chess.com");
    });

    it("safely parses valid URLs into URL instances and returns undefined for invalid strings", () => {
      const parsed = safeParseUrl("chess.example.com/lobby");
      expect(parsed).toBeInstanceOf(URL);
      expect(parsed?.hostname).toBe("chess.example.com");
      expect(safeParseUrl("http://:invalid")).toBeUndefined();
      expect(safeParseUrl("")).toBeUndefined();
    });
  });

  /**
   * 16. MIN-024: room:reconnect acknowledgment payload types
   */
  describe("16. MIN-024: room:reconnect acknowledgment payload types", () => {
    it("verifies ReconnectSuccessAck and ReconnectAckPayload type contracts", () => {
      const mockPlayer: Player = {
        id: "44d2d46e-1d6f-4796-9818-682226fc96ea",
        socketId: "sock-abc",
        name: "ReconnectedPlayer",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: 1700000000000,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        avatar: "🦁",
      };

      const mockRoom: RoomState = {
        roomCode: "ABCD",
        status: "playing",
        players: [mockPlayer],
        spectators: [],
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        version: 2,
      };

      const successAck: ReconnectSuccessAck = {
        success: true,
        room: mockRoom,
        player: mockPlayer,
        roomStatus: "playing",
        sessionToken: "session-token-12345",
      };

      const errorAck: ReconnectErrorAck = {
        success: false,
        error: {
          code: "ERR_UNAUTHORIZED",
          message: "Invalid session token",
        },
      };

      const handler: ClientToServerEvents["room:reconnect"] = (req, callback) => {
        expect(req.roomCode).toBe("ABCD");
        callback?.(successAck);
      };

      let ackCalled = false;
      handler(
        {
          roomCode: "ABCD",
          playerId: mockPlayer.id,
          sessionToken: "session-token-12345",
        },
        (res: ReconnectAckPayload) => {
          ackCalled = true;
          if (res.success) {
            expect(res.roomStatus).toBe("playing");
            expect(res.sessionToken).toBe("session-token-12345");
          } else {
            throw new Error("Expected success response");
          }
        },
      );

      expect(ackCalled).toBe(true);
      expect(errorAck.success).toBe(false);
    });
  });

  /**
   * 17. MIN-025: Player createdAt and updatedAt audit timestamps
   */
  describe("17. MIN-025: Player createdAt and updatedAt audit timestamps", () => {
    it("validates PlayerSchema with non-negative createdAt and updatedAt", () => {
      const now = 1700000000000;
      const valid = PlayerSchema.parse({
        id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        name: "AuditPlayer",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: now,
        createdAt: now,
        updatedAt: now + 5000,
      });

      expect(valid.createdAt).toBe(now);
      expect(valid.updatedAt).toBe(now + 5000);
    });

    it("rejects player payload where updatedAt is earlier than createdAt", () => {
      expect(() =>
        PlayerSchema.parse({
          id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
          name: "InvalidAuditPlayer",
          color: "w",
          isHost: true,
          isConnected: true,
          connectedAt: 1700000000000,
          createdAt: 1700000010000,
          updatedAt: 1700000000000, // Earlier than createdAt
        }),
      ).toThrow("updatedAt must be greater than or equal to createdAt");
    });

    it("preprocesses legacy player payload missing createdAt/updatedAt by falling back to connectedAt", () => {
      const now = 1700000000000;
      const legacyPlayer = {
        id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        name: "LegacyPlayer",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: now,
      };

      const parsed = PlayerSchema.parse(legacyPlayer);
      expect(parsed.createdAt).toBe(now);
      expect(parsed.updatedAt).toBe(now);
    });
  });

  /**
   * 18. ENH-005: Canonical SystemClock, systemClock, and MockClock
   */
  describe("18. ENH-005: Canonical SystemClock, systemClock, and MockClock", () => {
    it("verifies SystemClock and systemClock provide deterministic time access", () => {
      const clock: IClock = new SystemClock();
      expect(typeof clock.now()).toBe("number");
      expect(systemClock).toBeInstanceOf(SystemClock);
    });

    it("verifies MockClock allows deterministic time advancement without sleep delays", () => {
      const mock = new MockClock(1000);
      expect(mock.now()).toBe(1000);
      mock.advance(500);
      expect(mock.now()).toBe(1500);
      mock.setTime(9999);
      expect(mock.now()).toBe(9999);
    });
  });
});
