import { describe, it, expect } from 'vitest';
import type { TutorialStep } from '@fun-chess/shared';
import {
  validateStepMove,
  isSourceSquareAllowed,
  getAllowedTargetsForSource,
} from '../scenario_validator';

describe('scenario_validator', () => {
  const mockStepWithSpecificMoves: TutorialStep = {
    id: 'step-1',
    stepNumber: 1,
    instruction: 'Advance your pawn two squares forward!',
    hint: 'Move pawn from e2 to e4.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    allowedMoves: [
      { from: 'e2', to: 'e4' },
      { from: 'd2', to: 'd4' },
    ],
    explanationOnSuccess: 'Great opening pawn advance!',
  };

  const mockStepWithPromotion: TutorialStep = {
    id: 'step-promo',
    stepNumber: 2,
    instruction: 'Promote your pawn to a Queen!',
    hint: 'Push e7 to e8 and choose Queen.',
    setupFen: '8/4P3/8/8/8/8/8/4K2k w - - 0 1',
    allowedMoves: [
      { from: 'e7', to: 'e8', promotion: 'q' },
    ],
    explanationOnSuccess: 'Queen promoted successfully!',
  };

  const mockStepOpenEnded: TutorialStep = {
    id: 'step-open',
    stepNumber: 3,
    instruction: 'Make any move you like to explore.',
    hint: 'Any move is allowed.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    allowedMoves: [],
    explanationOnSuccess: 'Good exploration!',
  };

  const mockStepUndefinedMoves: TutorialStep = {
    id: 'step-undefined',
    stepNumber: 4,
    instruction: 'Free play step.',
    hint: 'No constraints.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    explanationOnSuccess: 'Done!',
  };

  describe('validateStepMove', () => {
    it('returns true when player move exactly matches an allowed constraint', () => {
      const result = validateStepMove(mockStepWithSpecificMoves, { from: 'e2', to: 'e4' });
      expect(result.valid).toBe(true);
    });

    it('returns true when player move matches an alternative allowed constraint', () => {
      const result = validateStepMove(mockStepWithSpecificMoves, { from: 'd2', to: 'd4' });
      expect(result.valid).toBe(true);
    });

    it('returns false when source square matches but destination square is incorrect', () => {
      const result = validateStepMove(mockStepWithSpecificMoves, { from: 'e2', to: 'e3' });
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('returns false when destination square matches but source square is incorrect', () => {
      const result = validateStepMove(mockStepWithSpecificMoves, { from: 'a2', to: 'e4' });
      expect(result.valid).toBe(false);
    });

    it('returns false when move is completely outside allowed moves', () => {
      const result = validateStepMove(mockStepWithSpecificMoves, { from: 'g1', to: 'f3' });
      expect(result.valid).toBe(false);
    });

    it('validates promotion moves with required promotion piece (case-insensitive)', () => {
      // Correct promotion
      expect(
        validateStepMove(mockStepWithPromotion, { from: 'e7', to: 'e8', promotion: 'q' }).valid
      ).toBe(true);
      expect(
        validateStepMove(mockStepWithPromotion, { from: 'e7', to: 'e8', promotion: 'Q' }).valid
      ).toBe(true);

      // Wrong promotion piece
      expect(
        validateStepMove(mockStepWithPromotion, { from: 'e7', to: 'e8', promotion: 'r' }).valid
      ).toBe(false);
      expect(
        validateStepMove(mockStepWithPromotion, { from: 'e7', to: 'e8', promotion: 'n' }).valid
      ).toBe(false);

      // Missing promotion piece when required
      expect(
        validateStepMove(mockStepWithPromotion, { from: 'e7', to: 'e8' }).valid
      ).toBe(false);
    });

    it('returns true when allowedMoves is empty (open-ended step)', () => {
      expect(validateStepMove(mockStepOpenEnded, { from: 'e2', to: 'e4' }).valid).toBe(true);
      expect(validateStepMove(mockStepOpenEnded, { from: 'g1', to: 'f3' }).valid).toBe(true);
    });

    it('returns true when allowedMoves is undefined', () => {
      expect(validateStepMove(mockStepUndefinedMoves, { from: 'b1', to: 'c3' }).valid).toBe(true);
    });

    it('returns false safely when step is null or undefined', () => {
      expect(validateStepMove(null as unknown as TutorialStep, { from: 'e2', to: 'e4' }).valid).toBe(false);
      expect(validateStepMove(undefined as unknown as TutorialStep, { from: 'e2', to: 'e4' }).valid).toBe(false);
    });
  });

  describe('isSourceSquareAllowed', () => {
    it('returns true if square exists as a source in allowedMoves', () => {
      expect(isSourceSquareAllowed(mockStepWithSpecificMoves, 'e2')).toBe(true);
      expect(isSourceSquareAllowed(mockStepWithSpecificMoves, 'd2')).toBe(true);
    });

    it('returns false if square does not exist in allowedMoves', () => {
      expect(isSourceSquareAllowed(mockStepWithSpecificMoves, 'c2')).toBe(false);
      expect(isSourceSquareAllowed(mockStepWithSpecificMoves, 'e4')).toBe(false);
    });

    it('returns true when allowedMoves is empty or undefined', () => {
      expect(isSourceSquareAllowed(mockStepOpenEnded, 'a2')).toBe(true);
      expect(isSourceSquareAllowed(mockStepUndefinedMoves, 'g1')).toBe(true);
      expect(isSourceSquareAllowed(null as unknown as TutorialStep, 'e2')).toBe(true);
    });
  });

  describe('getAllowedTargetsForSource', () => {
    it('returns array of targets for a given source square', () => {
      expect(getAllowedTargetsForSource(mockStepWithSpecificMoves, 'e2')).toEqual(['e4']);
      expect(getAllowedTargetsForSource(mockStepWithSpecificMoves, 'd2')).toEqual(['d4']);
    });

    it('returns empty array if source square is not constrained', () => {
      expect(getAllowedTargetsForSource(mockStepWithSpecificMoves, 'a2')).toEqual([]);
    });

    it('returns multiple targets if source square has multiple branches', () => {
      const branchingStep: TutorialStep = {
        id: 'branch-1',
        stepNumber: 1,
        instruction: 'Move knight to either active square',
        hint: 'Nf3 or Nc3',
        setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        allowedMoves: [
          { from: 'b1', to: 'c3' },
          { from: 'b1', to: 'a3' },
        ],
        explanationOnSuccess: 'Good knight move!',
      };

      expect(getAllowedTargetsForSource(branchingStep, 'b1')).toEqual(['c3', 'a3']);
    });

    it('returns empty array when allowedMoves is empty, undefined, or step is null', () => {
      expect(getAllowedTargetsForSource(mockStepOpenEnded, 'e2')).toEqual([]);
      expect(getAllowedTargetsForSource(mockStepUndefinedMoves, 'e2')).toEqual([]);
      expect(getAllowedTargetsForSource(null as unknown as TutorialStep, 'e2')).toEqual([]);
    });
  });

  describe('Sound Checkmate Validation (Alternative Moves)', () => {
    const stepWithCheckmate: TutorialStep = {
      id: 'step-cm',
      stepNumber: 1,
      instruction: 'Deliver checkmate!',
      hint: 'Qg7# or Qh2#',
      setupFen: '7k/5K2/8/8/8/8/8/2R3Q1 w - - 0 1',
      allowedMoves: [{ from: 'g1', to: 'g7' }],
      explanationOnSuccess: 'Checkmate!',
    };

    it('returns true when move is not in allowedMoves but delivers sound checkmate', () => {
      // Qh2# is sound checkmate, but not explicitly in allowedMoves
      expect(validateStepMove(stepWithCheckmate, { from: 'g1', to: 'h2' }).valid).toBe(true);

      // Non-checkmating move is not accepted
      expect(validateStepMove(stepWithCheckmate, { from: 'c1', to: 'c4' }).valid).toBe(false);
    });

    it('includes checkmating destination squares in getAllowedTargetsForSource', () => {
      const targets = getAllowedTargetsForSource(stepWithCheckmate, 'g1');
      expect(targets).toContain('g7'); // from allowedMoves
      expect(targets).toContain('h2'); // sound checkmate alternative
      expect(targets).toContain('h1'); // sound checkmate alternative
    });

    it('returns true in isSourceSquareAllowed for square with checkmating moves', () => {
      expect(isSourceSquareAllowed(stepWithCheckmate, 'g1')).toBe(true);
    });
  });
});
