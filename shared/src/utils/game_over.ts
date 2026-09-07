import type {
  PieceColor,
  GameOverReason,
  GameOverPayload,
} from "../contracts/models.js";

export {
  calculateMaterialAndCaptures,
  isPawnPromotion,
  createInitialGameState,
} from "./chess_evaluation.js";

/**
 * Input options for constructing a unified GameOverPayload.
 */
export interface CreateGameOverPayloadOptions {
  /** Winner piece color ('w' | 'b') or 'draw' */
  winner: PieceColor | "draw";
  /** Formal game over reason */
  reason: GameOverReason;
  /** Final board position in FEN notation */
  finalFen: string;
  /** Total moves completed in the match */
  totalMoves: number;
  /** Explicit duration in seconds; if omitted, computed from startTimeMs and nowMs */
  durationSeconds?: number;
  /** Timestamp when match started (epoch milliseconds) */
  startTimeMs?: number;
  /** Current timestamp (epoch milliseconds) for duration calculation */
  nowMs?: number;
  /** Display name of the winning player or entity */
  winnerName?: string;
  /** Display name of the resigning or disconnecting player */
  loserName?: string;
  /** Optional custom message overriding the default formatted banner */
  message?: string;
}

/**
 * Standardizes the human-readable banner message for match conclusions across server and client.
 *
 * @param winner - Winner piece color or 'draw'
 * @param reason - Formal game over reason
 * @param winnerName - Optional display name of winner
 * @param loserName - Optional display name of loser/resigning player
 * @returns Formatted game over message string
 */
export function formatGameOverMessage(
  winner: PieceColor | "draw",
  reason: GameOverReason,
  winnerName?: string,
  loserName?: string,
): string {
  if (winner === "draw") {
    if (reason === "draw_agreement") {
      return "Match concluded with a mutually agreed draw.";
    }
    if (reason === "abandonment") {
      return "Both players disconnected. Game ended by abandonment.";
    }
    return `Draw by ${reason.replace(/_/g, " ")}!`;
  }

  const victor = winnerName || (winner === "w" ? "White" : "Black");
  if (reason === "checkmate") {
    return `Checkmate! ${victor} won the match.`;
  }
  if (reason === "resignation") {
    const defeated = loserName || (winner === "w" ? "Black" : "White");
    return `${defeated} resigned. ${victor} won the match!`;
  }
  if (reason === "abandonment") {
    const defeated = loserName || (winner === "w" ? "Black" : "White");
    return `${defeated} disconnected. ${victor} won by abandonment!`;
  }
  return `${victor} won the match (${reason.replace(/_/g, " ")})!`;
}

/**
 * Pure factory function constructing a normalized, strongly-typed GameOverPayload.
 * Eliminates duplicate object assembly and calculates duration deterministically.
 *
 * @param options - Configuration options for the game over payload
 * @returns Unified GameOverPayload
 */
export function createGameOverPayload(
  options: CreateGameOverPayloadOptions,
): GameOverPayload {
  let durationSeconds = options.durationSeconds;
  if (durationSeconds === undefined) {
    if (options.startTimeMs !== undefined) {
      const now = options.nowMs ?? Date.now();
      durationSeconds = Math.max(
        1,
        Math.round((now - options.startTimeMs) / 1000),
      );
    } else {
      durationSeconds = 1;
    }
  }

  const message =
    options.message ??
    formatGameOverMessage(
      options.winner,
      options.reason,
      options.winnerName,
      options.loserName,
    );

  return {
    winner: options.winner,
    winnerName: options.winnerName,
    reason: options.reason,
    message,
    finalFen: options.finalFen,
    totalMoves: options.totalMoves,
    durationSeconds,
  };
}
