import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { ALL_SCENARIOS, SCENARIOS_MAP, CURRICULUM_SECTIONS } from '../index';

describe('Scenarios Data Integrity & Chess Rules Validation', () => {
  it('contains exactly 43 curated scenarios', () => {
    expect(ALL_SCENARIOS.length).toBe(43);
    expect(SCENARIOS_MAP.size).toBe(43);
  });

  it('has unique identifiers for every scenario', () => {
    const ids = ALL_SCENARIOS.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('verifies all curriculum sections correctly group scenarios without orphans or duplicates', () => {
    const sectionScenarios = CURRICULUM_SECTIONS.flatMap((sec) => sec.scenarios);
    expect(sectionScenarios.length).toBe(ALL_SCENARIOS.length);

    const sectionIds = sectionScenarios.map((s) => s.id);
    const allIds = ALL_SCENARIOS.map((s) => s.id);
    expect(new Set(sectionIds)).toEqual(new Set(allIds));
  });

  it.each(ALL_SCENARIOS)('validates scenario: $id ($title)', (scenario) => {
    expect(scenario.id).toBeTruthy();
    expect(scenario.title).toBeTruthy();
    expect(scenario.subtitle).toBeTruthy();
    expect(scenario.description).toBeTruthy();
    expect(scenario.icon).toBeTruthy();
    expect(scenario.estimatedMinutes).toBeGreaterThan(0);
    expect(scenario.steps.length).toBeGreaterThan(0);

    const stepIds = scenario.steps.map((st) => st.id);
    expect(new Set(stepIds).size).toBe(stepIds.length);

    scenario.steps.forEach((step, index) => {
      expect(step.stepNumber).toBe(index + 1);
      expect(step.instruction).toBeTruthy();
      expect(step.hint).toBeTruthy();
      expect(step.explanationOnSuccess).toBeTruthy();

      // Validate FEN loading
      const chess = new Chess();
      expect(() => chess.load(step.setupFen)).not.toThrow();

      // If allowedMoves are specified, verify each is a strictly legal move
      if (step.allowedMoves && step.allowedMoves.length > 0) {
        step.allowedMoves.forEach((moveConstraint) => {
          const testChess = new Chess();
          testChess.load(step.setupFen);

          const moveResult = testChess.move({
            from: moveConstraint.from,
            to: moveConstraint.to,
            promotion: moveConstraint.promotion,
          });

          expect(
            moveResult,
            `Move ${moveConstraint.from}->${moveConstraint.to} in step ${step.id} of scenario ${scenario.id} must be legal in FEN: ${step.setupFen}`
          ).not.toBeNull();
        });
      }

      // If opponent response is specified, verify it is legal after the primary allowed move
      if (step.opponentResponse && step.allowedMoves && step.allowedMoves.length > 0) {
        const testChess = new Chess();
        testChess.load(step.setupFen);

        const primaryMove = step.allowedMoves[0];
        testChess.move({
          from: primaryMove.from,
          to: primaryMove.to,
          promotion: primaryMove.promotion,
        });

        const botMove = step.opponentResponse;
        const botResult = testChess.move({
          from: botMove.from,
          to: botMove.to,
          promotion: botMove.promotion,
        });

        expect(
          botResult,
          `Opponent move ${botMove.from}->${botMove.to} in step ${step.id} of scenario ${scenario.id} must be legal after player move`
        ).not.toBeNull();
      }
    });
  });
});
