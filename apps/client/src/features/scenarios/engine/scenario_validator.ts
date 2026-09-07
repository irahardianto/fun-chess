import type { Square, TutorialStep, StepMoveConstraint } from '@fun-chess/shared';
import type { Square as ChessSquare } from 'chess.js';
import { createSafeChess } from '@fun-chess/shared';

export interface PlayerMoveInput {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n' | string;
}

/**
 * Validates whether a player move matches the allowed move constraints for a given tutorial step,
 * or delivers sound checkmate (chess.isCheckmate()).
 * Pure function adhering to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 *
 * @param step - Current active TutorialStep
 * @param move - Proposed move by the player
 * @param chess - Optional chess.js engine instance or object with .fen()
 * @returns true if the move satisfies the step constraints or delivers checkmate, false otherwise
 */
export function validateStepMove(
  step: TutorialStep,
  move: PlayerMoveInput,
  chess?: { fen(): string } | null
): boolean {
  if (!step) return false;
  if (!move || !move.from || !move.to) return false;

  const normalizedPromotion = move.promotion ? move.promotion.toLowerCase() : undefined;

  // If step defines specific allowed move constraints, verify match
  if (step.allowedMoves && step.allowedMoves.length > 0) {
    const isConstraintMatched = step.allowedMoves.some((constraint: StepMoveConstraint) => {
      const matchFrom = constraint.from === move.from;
      const matchTo = constraint.to === move.to;
      const matchPromo = !constraint.promotion || constraint.promotion.toLowerCase() === normalizedPromotion;
      return matchFrom && matchTo && matchPromo;
    });

    if (isConstraintMatched) {
      return true;
    }
  } else {
    // If no specific allowed moves specified, any move is acceptable
    return true;
  }

  // Check if proposed move delivers sound checkmate
  const fen = typeof chess?.fen === 'function' ? chess.fen() : step.setupFen;
  if (fen) {
    try {
      const testEngine = createSafeChess(fen);
      const res = testEngine.move({
        from: move.from as ChessSquare,
        to: move.to as ChessSquare,
        promotion: (normalizedPromotion as 'q' | 'r' | 'b' | 'n' | undefined) ?? 'q',
      });
      if (res && testEngine.isCheckmate()) {
        return true;
      }
    } catch {
      // Invalid or illegal move
    }
  }

  return false;
}

/**
 * Checks if a specific from-square has any allowed moves in the current step.
 */
export function isSourceSquareAllowed(
  step: TutorialStep,
  from: Square,
  chess?: { fen(): string } | null
): boolean {
  if (!step || !step.allowedMoves || step.allowedMoves.length === 0) {
    return true;
  }
  if (step.allowedMoves.some((c) => c.from === from)) {
    return true;
  }

  // Check if this source square has any moves delivering checkmate
  const fen = typeof chess?.fen === 'function' ? chess.fen() : step.setupFen;
  if (fen) {
    try {
      const testEngine = createSafeChess(fen);
      const legalMoves = testEngine.moves({
        square: from as ChessSquare,
        verbose: true,
      });
      for (const m of legalMoves) {
        const simEngine = createSafeChess(fen);
        const res = simEngine.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion,
        });
        if (res && simEngine.isCheckmate()) {
          return true;
        }
      }
    } catch {
      // Ignore
    }
  }

  return false;
}

/**
 * Returns allowed destination squares for a given source square in the current step.
 */
export function getAllowedTargetsForSource(
  step: TutorialStep,
  from: Square,
  chess?: { fen(): string } | null
): Square[] {
  if (!step) {
    return [];
  }

  const targets = new Set<Square>();

  if (step.allowedMoves && step.allowedMoves.length > 0) {
    step.allowedMoves
      .filter((c) => c.from === from)
      .forEach((c) => targets.add(c.to));
  }

  // Check if any legal move from this square delivers checkmate
  const fen = typeof chess?.fen === 'function' ? chess.fen() : step.setupFen;
  if (fen) {
    try {
      const testEngine = createSafeChess(fen);
      const legalMoves = testEngine.moves({
        square: from as ChessSquare,
        verbose: true,
      });
      for (const m of legalMoves) {
        if (targets.has(m.to as Square)) continue;
        const simEngine = createSafeChess(fen);
        const res = simEngine.move({
          from: m.from,
          to: m.to,
          promotion: m.promotion,
        });
        if (res && simEngine.isCheckmate()) {
          targets.add(m.to as Square);
        }
      }
    } catch {
      // Ignore
    }
  }

  return Array.from(targets);
}
