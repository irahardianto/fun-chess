import { Chess, validateFen } from "chess.js";

/**
 * Standard chess starting position FEN.
 */
export const DEFAULT_CHESS_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Injectable logger interface for Chess factory and FEN loaders.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 */
export interface ChessLogger {
  warn(message: string, ...args: unknown[]): void;
}

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
 * @param logger - Optional injectable logger (defaults to console for backward compatibility; safe no-op if null/empty)
 * @returns A fully valid, initialized Chess instance
 */
export function createSafeChess(
  fen?: string,
  logger: ChessLogger = console,
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
      logger?.warn(
        `[createSafeChess] Invalid FEN "${trimmed}": ${validation.error ?? "Malformed position"}. Falling back to standard starting position.`,
      );
      return new Chess();
    }
    return new Chess(trimmed);
  } catch (err) {
    logger?.warn(
      `[createSafeChess] Failed to initialize position "${trimmed}": ${err instanceof Error ? err.message : String(err)}. Falling back to standard starting position.`,
    );
    return new Chess();
  }
}

/**
 * Safely loads a FEN into an existing Chess instance without crashing if the FEN is invalid.
 * If the FEN is invalid or throws, the chess instance is restored to its previous position
 * (or standard position if corrupted) and returns false.
 *
 * @param chess - The Chess instance to update
 * @param fen - The FEN string to load
 * @param logger - Optional injectable logger (defaults to console for backward compatibility; safe no-op if null/empty)
 * @returns true if the FEN was successfully loaded, false otherwise
 */
export function safeLoadFen(
  chess: Chess,
  fen: string,
  logger: ChessLogger = console,
): boolean {
  if (!chess) {
    return false;
  }
  if (!isValidFen(fen)) {
    logger?.warn(`[safeLoadFen] Invalid FEN "${fen}".`);
    return false;
  }

  const previousFen = chess.fen();
  try {
    chess.load(fen.trim());
    return true;
  } catch (err) {
    logger?.warn(
      `[safeLoadFen] Failed to load FEN "${fen}": ${err instanceof Error ? err.message : String(err)}.`,
    );
    // Restore previous state if possible
    try {
      chess.load(previousFen);
    } catch {
      chess.reset();
    }
    return false;
  }
}
