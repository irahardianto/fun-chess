import { Chess, validateFen } from "chess.js";

/**
 * Standard chess starting position FEN.
 */
export const DEFAULT_CHESS_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Structured metadata accompanying ChessLogger warnings (ENH-008).
 */
export interface ChessLoggerMetadata {
  readonly operation?: string;
  readonly fen?: string;
  readonly error?: string;
  readonly [key: string]: unknown;
}

/**
 * Injectable logger interface for Chess factory and FEN loaders.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 * Supports structured metadata parameter on warn (ENH-008).
 */
export interface ChessLogger {
  warn(
    message: string,
    meta?: ChessLoggerMetadata,
    ...args: unknown[]
  ): void;
  error?(
    message: string,
    meta?: ChessLoggerMetadata,
    ...args: unknown[]
  ): void;
}

/**
 * Default logger for Chess factory operations (MIN-004).
 * Emits structured warnings to console.warn when warnings occur.
 */
export const DEFAULT_CHESS_LOGGER: ChessLogger = {
  warn: (message: string, meta?: ChessLoggerMetadata, ...args: unknown[]) => {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      if (meta) {
        console.warn(message, meta, ...args);
      } else {
        console.warn(message, ...args);
      }
    }
  },
  error: (message: string, meta?: ChessLoggerMetadata, ...args: unknown[]) => {
    if (typeof console !== "undefined" && typeof console.error === "function") {
      if (meta) {
        console.error(message, meta, ...args);
      } else {
        console.error(message, ...args);
      }
    }
  },
};

/**
 * Backwards-compatible alias for default chess logger.
 * Note: No longer silently suppresses warnings per MIN-004.
 */
export const SILENT_CHESS_LOGGER: ChessLogger = DEFAULT_CHESS_LOGGER;

/**
 * Validates whether a given value is a syntactically and structurally valid chess FEN.
 *
 * @param fen - Potential FEN string to validate
 * @returns true if valid chess FEN, false otherwise
 */
export function isValidFen(fen: unknown): fen is string {
  if (typeof fen !== "string") {
    return false;
  }
  const trimmed = fen.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const result = validateFen(trimmed);
    return result.ok === true;
  } catch {
    return false;
  }
}

/**
 * Safely creates a Chess instance.
 * - If fen is omitted, undefined, or empty, initializes standard starting position.
 * - If fen is valid, loads the specified position.
 * - If fen is invalid or causes an error, falls back safely to standard starting position and logs a warning.
 *
 * @param fen - Optional FEN string to initialize
 * @param logger - Optional injectable logger (defaults to DEFAULT_CHESS_LOGGER)
 * @returns A fully valid, initialized Chess instance
 */
export function createSafeChess(
  fen?: string,
  logger: ChessLogger = DEFAULT_CHESS_LOGGER,
): Chess {
  if (!fen || typeof fen !== "string") {
    return new Chess();
  }

  const trimmed = fen.trim();
  if (!trimmed) {
    return new Chess();
  }

  try {
    const validation = validateFen(trimmed);
    if (!validation.ok) {
      const errorMsg = validation.error ?? "Malformed position";
      logger?.warn(
        `[createSafeChess] Invalid FEN "${trimmed}": ${errorMsg}. Falling back to standard starting position.`,
        {
          operation: "create_safe_chess",
          fen: trimmed,
          error: errorMsg,
        },
      );
      return new Chess();
    }
    return new Chess(trimmed);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger?.warn(
      `[createSafeChess] Failed to initialize position "${trimmed}": ${errorMsg}. Falling back to standard starting position.`,
      {
        operation: "create_safe_chess",
        fen: trimmed,
        error: errorMsg,
      },
    );
    return new Chess();
  }
}

/**
 * Restores chess instance to its previous FEN, falling back to reset on failure.
 * Extracted helper to avoid deeply nested try-catch blocks in safeLoadFen (ENH-011).
 *
 * @param chess - Active Chess instance
 * @param previousFen - Previous valid FEN string
 * @param logger - Optional logger
 */
function restoreChessState(
  chess: Chess,
  previousFen: string,
  logger?: ChessLogger,
): void {
  try {
    chess.load(previousFen);
  } catch (restoreErr) {
    logger?.warn(
      `[safeLoadFen] Failed to restore previous FEN "${previousFen}": ${restoreErr instanceof Error ? restoreErr.message : String(restoreErr)}`,
      {
        operation: "safe_load_fen_restore_previous",
        previousFen,
        error:
          restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
      },
    );
    try {
      chess.reset();
    } catch (resetErr) {
      logger?.error?.(
        `[safeLoadFen] Failed to reset chess instance after load failure: ${resetErr instanceof Error ? resetErr.message : String(resetErr)}`,
        {
          operation: "safe_load_fen_reset_fallback",
          error:
            resetErr instanceof Error ? resetErr.message : String(resetErr),
        },
      );
    }
  }
}

/**
 * Safely loads a FEN into an existing Chess instance without crashing if the FEN is invalid.
 * If the FEN is invalid or throws, the chess instance is restored to its previous position
 * (or standard position if corrupted) and returns false.
 *
 * @param chess - The Chess instance to update
 * @param fen - The FEN string to load
 * @param logger - Optional injectable logger (defaults to DEFAULT_CHESS_LOGGER)
 * @returns true if the FEN was successfully loaded, false otherwise
 */
export function safeLoadFen(
  chess: Chess,
  fen: string,
  logger: ChessLogger = DEFAULT_CHESS_LOGGER,
): boolean {
  if (!chess) {
    return false;
  }
  if (!isValidFen(fen)) {
    logger?.warn(`[safeLoadFen] Invalid FEN "${fen}".`, {
      operation: "safe_load_fen",
      fen,
      error: "Invalid FEN syntax or board state",
    });
    return false;
  }

  const previousFen = chess.fen();
  try {
    chess.load(fen.trim());
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger?.warn(`[safeLoadFen] Failed to load FEN "${fen}": ${errorMsg}.`, {
      operation: "safe_load_fen",
      fen,
      error: errorMsg,
    });
    restoreChessState(chess, previousFen, logger);
    return false;
  }
}
