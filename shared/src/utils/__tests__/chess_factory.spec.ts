import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Chess, validateFen } from "chess.js";

vi.mock("chess.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("chess.js")>();
  return {
    ...actual,
    validateFen: vi.fn(actual.validateFen),
  };
});

import {
  DEFAULT_CHESS_FEN,
  isValidFen,
  createSafeChess,
  safeLoadFen,
  DEFAULT_CHESS_LOGGER,
  SILENT_CHESS_LOGGER,
  setChessLogHandler,
  NOOP_CHESS_LOGGER,
  type ChessLogger,
} from "../chess_factory.js";

describe("Safe Chess Factory & FEN Validator", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    setChessLogHandler(null);
    vi.restoreAllMocks();
  });

  describe("DEFAULT_CHESS_FEN constant", () => {
    it("matches standard initial chess position", () => {
      expect(DEFAULT_CHESS_FEN).toBe(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      );
    });
  });

  describe("isValidFen()", () => {
    it("returns true for standard starting position FEN", () => {
      expect(isValidFen(DEFAULT_CHESS_FEN)).toBe(true);
    });

    it("returns true for valid mid-game and endgame FEN positions", () => {
      // Scholar's mate position
      const scholarsMate =
        "r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
      expect(isValidFen(scholarsMate)).toBe(true);

      // Endgame position with kings and pawns
      const endgame = "8/5k2/8/8/8/8/4K3/8 w - - 0 1";
      expect(isValidFen(endgame)).toBe(true);

      // En-passant available FEN
      const enPassant =
        "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2";
      expect(isValidFen(enPassant)).toBe(true);
    });

    it("returns false for undefined, null, empty string, and non-string inputs", () => {
      expect(isValidFen(undefined)).toBe(false);
      expect(isValidFen(null)).toBe(false);
      expect(isValidFen("")).toBe(false);
      expect(isValidFen("   ")).toBe(false);
      expect(isValidFen(12345)).toBe(false);
      expect(isValidFen({})).toBe(false);
      expect(isValidFen([])).toBe(false);
      expect(isValidFen(true)).toBe(false);
    });

    it("returns false for corrupted or illegal FEN strings", () => {
      // Missing kings
      expect(isValidFen("8/8/8/8/8/8/8/8 w - - 0 1")).toBe(false);

      // Illegal piece characters
      expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w KQkq - 0 1")).toBe(false);

      // Too few ranks
      expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1")).toBe(false);

      // Invalid active turn indicator
      expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1")).toBe(false);

      // Random garbage text
      expect(isValidFen("not-a-valid-fen-at-all")).toBe(false);
    });

    it("returns false if validateFen throws in isValidFen", () => {
      vi.mocked(validateFen).mockImplementationOnce(() => {
        throw new Error("Validation crash");
      });
      expect(isValidFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(false);
    });
  });

  describe("createSafeChess()", () => {
    it("creates a Chess instance with standard starting position when called with no arguments", () => {
      const chess = createSafeChess();
      expect(chess).toBeInstanceOf(Chess);
      expect(chess.fen()).toBe(DEFAULT_CHESS_FEN);
      expect(chess.turn()).toBe("w");
      expect(chess.history()).toHaveLength(0);
    });

    it("creates a Chess instance with standard starting position when called with undefined, empty string, or whitespace", () => {
      expect(createSafeChess(undefined).fen()).toBe(DEFAULT_CHESS_FEN);
      expect(createSafeChess("").fen()).toBe(DEFAULT_CHESS_FEN);
      expect(createSafeChess("   ").fen()).toBe(DEFAULT_CHESS_FEN);
    });

    it("successfully loads a valid custom FEN", () => {
      const customFen =
        "r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4";
      const chess = createSafeChess(customFen);
      expect(chess).toBeInstanceOf(Chess);
      expect(chess.fen()).toBe(customFen);
      expect(chess.turn()).toBe("w");
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("safely falls back to default starting position when passed an invalid FEN without throwing", () => {
      const invalidFens = [
        "invalid-fen-string",
        "8/8/8/8/8/8/8/8 w - - 0 1", // no kings
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR z KQkq - 0 1", // invalid turn
        "rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // rank width > 8
      ];

      for (const badFen of invalidFens) {
        const chess = createSafeChess(badFen);
        expect(chess).toBeInstanceOf(Chess);
        expect(chess.fen()).toBe(DEFAULT_CHESS_FEN);
        expect(chess.turn()).toBe("w");
      }

      expect(console.warn).toHaveBeenCalledTimes(4);
    });

    it("suppresses console.warn when a custom silent logger is explicitly provided", () => {
      const silentLogger: ChessLogger = { warn: () => {} };
      createSafeChess("invalid-fen-string", silentLogger);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("invokes console.warn if console is explicitly provided (MIN-014)", () => {
      createSafeChess("invalid-fen-string", console);
      expect(console.warn).toHaveBeenCalled();
    });

    it("invokes injectable mockLogger.warn with structured metadata when provided an invalid FEN (ENH-008)", () => {
      const mockLogger: ChessLogger = {
        warn: vi.fn(),
      };
      const badFen = "invalid-fen-string";
      const chess = createSafeChess(badFen, mockLogger);

      expect(chess).toBeInstanceOf(Chess);
      expect(chess.fen()).toBe(DEFAULT_CHESS_FEN);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "[createSafeChess] Invalid FEN. Falling back to standard starting position.",
        expect.objectContaining({
          operation: "create_safe_chess",
          fen: badFen,
        }),
      );
    });

    it("ensures warning messages are static templates with dynamic data in metadata (MIN-013)", () => {
      const mockLogger: ChessLogger = { warn: vi.fn() };
      const badFen = "invalid-fen-12345";
      createSafeChess(badFen, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "[createSafeChess] Invalid FEN. Falling back to standard starting position.",
        {
          operation: "create_safe_chess",
          fen: badFen,
          error: expect.any(String),
        },
      );
      // Ensure the message string does not contain the dynamic FEN string
      const firstArg = vi.mocked(mockLogger.warn).mock.calls[0]?.[0];
      expect(firstArg).not.toContain(badFen);
    });

    it("safely operates without crashing when no logger is passed", () => {
      expect(() => createSafeChess("bad-fen")).not.toThrow();
      const chess = createSafeChess("bad-fen");
      expect(chess).toBeInstanceOf(Chess);
      expect(chess.fen()).toBe(DEFAULT_CHESS_FEN);
    });
  });

  describe("safeLoadFen()", () => {
    it("loads a valid FEN into an existing Chess instance and returns true", () => {
      const chess = new Chess();
      const validPosition =
        "r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4";

      const result = safeLoadFen(chess, validPosition);
      expect(result).toBe(true);
      expect(chess.fen()).toBe(validPosition);
    });

    it("rejects an invalid FEN, returns false without throwing, and preserves previous position", () => {
      const chess = new Chess();
      const initialFen = chess.fen();

      const result = safeLoadFen(chess, "corrupted-fen-text");
      expect(result).toBe(false);
      expect(chess.fen()).toBe(initialFen);
    });

    it("invokes injectable mockLogger.warn with structured metadata when loading an invalid FEN (ENH-008)", () => {
      const chess = new Chess();
      const mockLogger: ChessLogger = {
        warn: vi.fn(),
      };
      const badFen = "corrupted-fen-text";

      const result = safeLoadFen(chess, badFen, mockLogger);
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[safeLoadFen] Invalid FEN"),
        expect.objectContaining({
          operation: "safe_load_fen",
          fen: badFen,
        }),
      );
    });

    it("safely operates without crashing when no logger is passed", () => {
      const chess = new Chess();
      expect(() => safeLoadFen(chess, "corrupted-fen-text")).not.toThrow();
      const result = safeLoadFen(chess, "corrupted-fen-text");
      expect(result).toBe(false);
    });

    it("returns false gracefully if chess instance is null or undefined", () => {
      expect(safeLoadFen(null as unknown as Chess, DEFAULT_CHESS_FEN)).toBe(false);
    });

    it("uses default error message when validation.error is undefined", () => {
      vi.mocked(validateFen).mockReturnValueOnce({ ok: false } as ReturnType<typeof validateFen>);
      const mockLogger: ChessLogger = { warn: vi.fn() };
      createSafeChess("bad-fen", mockLogger);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[createSafeChess] Invalid FEN"),
        expect.objectContaining({ error: "Malformed position" }),
      );
    });

    it("handles non-Error exception in createSafeChess", () => {
      vi.mocked(validateFen).mockImplementationOnce(() => {
        throw "String exception";
      });
      const mockLogger: ChessLogger = { warn: vi.fn() };
      createSafeChess("bad-fen", mockLogger);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[createSafeChess] Failed to initialize position"),
        expect.objectContaining({ error: "String exception" }),
      );
    });

    it("recovers safely when position initialization throws in createSafeChess (MIN-034)", () => {
      vi.mocked(validateFen).mockImplementationOnce(() => {
        throw new Error("Validation engine crashed");
      });
      const mockLogger: ChessLogger = { warn: vi.fn() };

      const chess = createSafeChess("bad-fen", mockLogger);
      expect(chess).toBeInstanceOf(Chess);
      expect(chess.fen()).toBe(DEFAULT_CHESS_FEN);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[createSafeChess] Failed to initialize position"),
        expect.objectContaining({
          operation: "create_safe_chess",
          fen: "bad-fen",
          error: "Validation engine crashed",
        }),
      );
    });

    it("recovers safely when chess.load throws in safeLoadFen and restores previous state (MIN-034)", () => {
      const chess = new Chess();
      const initialFen = chess.fen();
      const mockLogger: ChessLogger = { warn: vi.fn() };

      let callCount = 0;
      const originalLoad = chess.load.bind(chess);
      vi.spyOn(chess, "load").mockImplementation((fen: string) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Simulated load failure");
        }
        return originalLoad(fen);
      });

      const validFen = "8/5k2/8/8/8/8/4K3/8 w - - 0 1";
      const result = safeLoadFen(chess, validFen, mockLogger);

      expect(result).toBe(false);
      expect(chess.fen()).toBe(initialFen);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[safeLoadFen] Failed to load FEN"),
        expect.objectContaining({
          operation: "safe_load_fen",
          fen: validFen,
          error: "Simulated load failure",
        }),
      );
    });

    it("falls back to chess.reset() when restoring previous state also throws in safeLoadFen (MIN-034)", () => {
      const chess = new Chess();
      const resetSpy = vi.spyOn(chess, "reset");
      let callCount = 0;
      vi.spyOn(chess, "load").mockImplementation(() => {
        callCount++;
        throw new Error(`Load attempt ${callCount} failed`);
      });

      const validFen = "8/5k2/8/8/8/8/4K3/8 w - - 0 1";
      const result = safeLoadFen(chess, validFen);

      expect(result).toBe(false);
      expect(resetSpy).toHaveBeenCalled();
    });

    it("logs error via logger.error when chess.reset() also throws in safeLoadFen restore fallback (ENH-011)", () => {
      const chess = new Chess();
      const mockLogger: ChessLogger = {
        warn: vi.fn(),
        error: vi.fn(),
      };

      vi.spyOn(chess, "load").mockImplementation(() => {
        throw new Error("Load failed");
      });
      vi.spyOn(chess, "reset").mockImplementation(() => {
        throw new Error("Reset crashed");
      });

      const validFen = "8/5k2/8/8/8/8/4K3/8 w - - 0 1";
      const result = safeLoadFen(chess, validFen, mockLogger);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[safeLoadFen] Failed to restore previous FEN"),
        expect.objectContaining({
          operation: "safe_load_fen_restore_previous",
          error: "Load failed",
        }),
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("[safeLoadFen] Failed to reset chess instance after load failure"),
        expect.objectContaining({
          operation: "safe_load_fen_reset_fallback",
          error: "Reset crashed",
        }),
      );
    });

    it("handles non-Error exception when chess.load throws in safeLoadFen", () => {
      const chess = new Chess();
      vi.spyOn(chess, "load").mockImplementationOnce(() => {
        throw "String load failure";
      });
      const mockLogger: ChessLogger = { warn: vi.fn() };
      const validFen = "8/5k2/8/8/8/8/4K3/8 w - - 0 1";
      expect(safeLoadFen(chess, validFen, mockLogger)).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[safeLoadFen] Failed to load FEN"),
        expect.objectContaining({ error: "String load failure" }),
      );
    });

    it("handles non-Error exception when restoring previous FEN throws in safeLoadFen", () => {
      const chess = new Chess();
      let callCount = 0;
      vi.spyOn(chess, "load").mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error("first fail");
        throw "String restore fail";
      });
      const mockLogger: ChessLogger = { warn: vi.fn() };
      const validFen = "8/5k2/8/8/8/8/4K3/8 w - - 0 1";
      expect(safeLoadFen(chess, validFen, mockLogger)).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[safeLoadFen] Failed to restore previous FEN"),
        expect.objectContaining({ error: "String restore fail" }),
      );
    });

    it("handles non-Error exception when reset throws in safeLoadFen", () => {
      const chess = new Chess();
      vi.spyOn(chess, "load").mockImplementation(() => {
        throw new Error("Load failed");
      });
      vi.spyOn(chess, "reset").mockImplementation(() => {
        throw "String reset fail";
      });
      const mockLogger: ChessLogger = { warn: vi.fn(), error: vi.fn() };
      const validFen = "8/5k2/8/8/8/8/4K3/8 w - - 0 1";
      expect(safeLoadFen(chess, validFen, mockLogger)).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("[safeLoadFen] Failed to reset chess instance after load failure"),
        expect.objectContaining({ error: "String reset fail" }),
      );
    });
  });

  describe("DEFAULT_CHESS_LOGGER & SILENT_CHESS_LOGGER (MIN-004)", () => {
    it("logs to console.warn via DEFAULT_CHESS_LOGGER with and without metadata", () => {
      DEFAULT_CHESS_LOGGER.warn("Warning without meta");
      expect(console.warn).toHaveBeenCalledWith("Warning without meta");

      DEFAULT_CHESS_LOGGER.warn("Warning with meta", { operation: "test" });
      expect(console.warn).toHaveBeenCalledWith("Warning with meta", { operation: "test" });
    });

    it("logs to console.error via DEFAULT_CHESS_LOGGER with and without metadata", () => {
      DEFAULT_CHESS_LOGGER.error?.("Error without meta");
      expect(console.error).toHaveBeenCalledWith("Error without meta");

      DEFAULT_CHESS_LOGGER.error?.("Error with meta", { operation: "test" });
      expect(console.error).toHaveBeenCalledWith("Error with meta", { operation: "test" });
    });

    it("aliases SILENT_CHESS_LOGGER to DEFAULT_CHESS_LOGGER", () => {
      expect(SILENT_CHESS_LOGGER).toBe(DEFAULT_CHESS_LOGGER);
    });
  });

  describe("setChessLogHandler & NOOP_CHESS_LOGGER (F-07)", () => {
    it("routes warnings to custom handler when registered", () => {
      const handler = vi.fn();
      setChessLogHandler(handler);

      DEFAULT_CHESS_LOGGER.warn("Custom warning message", { operation: "test_op" });

      expect(handler).toHaveBeenCalledWith(
        "warn",
        "Custom warning message",
        { operation: "test_op" },
      );
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("routes errors to custom handler when registered", () => {
      const handler = vi.fn();
      setChessLogHandler(handler);

      DEFAULT_CHESS_LOGGER.error?.("Custom error message", { operation: "test_error" });

      expect(handler).toHaveBeenCalledWith(
        "error",
        "Custom error message",
        { operation: "test_error" },
      );
      expect(console.error).not.toHaveBeenCalled();
    });

    it("resets to default console logging when setChessLogHandler(null) is called", () => {
      const handler = vi.fn();
      setChessLogHandler(handler);
      setChessLogHandler(null);

      DEFAULT_CHESS_LOGGER.warn("Warning after reset", { operation: "reset" });
      DEFAULT_CHESS_LOGGER.error?.("Error after reset", { operation: "reset" });

      expect(handler).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith("Warning after reset", { operation: "reset" });
      expect(console.error).toHaveBeenCalledWith("Error after reset", { operation: "reset" });
    });

    it("invokes custom handler during createSafeChess failure when registered", () => {
      const handler = vi.fn();
      setChessLogHandler(handler);

      createSafeChess("invalid-fen");

      expect(handler).toHaveBeenCalledWith(
        "warn",
        "[createSafeChess] Invalid FEN. Falling back to standard starting position.",
        expect.objectContaining({
          operation: "create_safe_chess",
          fen: "invalid-fen",
        }),
      );
    });

    it("provides NOOP_CHESS_LOGGER with no-op warn and error methods", () => {
      expect(typeof NOOP_CHESS_LOGGER.warn).toBe("function");
      expect(typeof NOOP_CHESS_LOGGER.error).toBe("function");

      expect(() => {
        NOOP_CHESS_LOGGER.warn("ignore this", { operation: "noop" });
        NOOP_CHESS_LOGGER.error?.("ignore error", { operation: "noop" });
      }).not.toThrow();

      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("suppresses warnings when NOOP_CHESS_LOGGER is provided to createSafeChess", () => {
      createSafeChess("bad-fen", NOOP_CHESS_LOGGER);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
