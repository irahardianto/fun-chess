import type { Square, TutorialStep, StepMoveConstraint } from '@fun-chess/shared';

export interface PlayerMoveInput {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n' | string;
}

/**
 * Validates whether a player move matches the allowed move constraints for a given tutorial step.
 * Pure function adhering to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 *
 * @param step - Current active TutorialStep
 * @param move - Proposed move by the player
 * @returns true if the move satisfies the step constraints, false otherwise
 */
export function validateStepMove(step: TutorialStep, move: PlayerMoveInput): boolean {
  if (!step) return false;

  // If no allowedMoves are specified or the array is empty, any legal move advances the step
  if (!step.allowedMoves || step.allowedMoves.length === 0) {
    return true;
  }

  const normalizedPromotion = move.promotion ? move.promotion.toLowerCase() : undefined;

  return step.allowedMoves.some((constraint: StepMoveConstraint) => {
    if (constraint.from !== move.from) return false;
    if (constraint.to !== move.to) return false;

    // Check promotion match if constraint specifies a promotion
    if (constraint.promotion) {
      const constraintPromo = constraint.promotion.toLowerCase();
      if (normalizedPromotion !== constraintPromo) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Checks if a specific from-square has any allowed moves in the current step.
 */
export function isSourceSquareAllowed(step: TutorialStep, from: Square): boolean {
  if (!step || !step.allowedMoves || step.allowedMoves.length === 0) {
    return true;
  }
  return step.allowedMoves.some((c) => c.from === from);
}

/**
 * Returns allowed destination squares for a given source square in the current step.
 */
export function getAllowedTargetsForSource(step: TutorialStep, from: Square): Square[] {
  if (!step || !step.allowedMoves || step.allowedMoves.length === 0) {
    return [];
  }
  return step.allowedMoves
    .filter((c) => c.from === from)
    .map((c) => c.to);
}
