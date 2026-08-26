import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  ALL_SCENARIOS,
  CURRICULUM_SECTIONS,
  SCENARIOS_MAP,
  getScenarioById,
  getNextScenario,
} from '../data';
import type { TutorialStep } from '@fun-chess/shared';

describe('Chess Academy Scenario Data Integrity (scenarios_data.spec.ts)', () => {
  it('contains at least 19 curated scenarios across curriculum sections', () => {
    expect(ALL_SCENARIOS.length).toBeGreaterThanOrEqual(19);
    expect(SCENARIOS_MAP.size).toBe(ALL_SCENARIOS.length);
  });

  it('contains properly populated curriculum sections', () => {
    expect(CURRICULUM_SECTIONS.length).toBeGreaterThanOrEqual(5);
    for (const section of CURRICULUM_SECTIONS) {
      expect(section.id).toBeDefined();
      expect(section.title).toBeTruthy();
      expect(section.subtitle).toBeTruthy();
      expect(section.icon).toBeTruthy();
      expect(section.scenarios.length).toBeGreaterThan(0);
    }
  });

  describe('Scenario Schema & Metadata Validation', () => {
    it.each(ALL_SCENARIOS.map((s) => [s.id, s]))(
      'scenario "%s" has complete valid metadata',
      (_id, scenario) => {
        expect(scenario.id).toBeTruthy();
        expect(scenario.title).toBeTruthy();
        expect(scenario.subtitle).toBeTruthy();
        expect(scenario.category).toBeTruthy();
        expect(['beginner', 'intermediate', 'advanced', 'master']).toContain(scenario.difficulty);
        expect(['5-8', '7-10', '11-15', 'all']).toContain(scenario.targetAgeGroup);
        expect(scenario.icon).toBeTruthy();
        expect(scenario.description).toBeTruthy();
        expect(scenario.estimatedMinutes).toBeGreaterThan(0);
        expect(scenario.steps.length).toBeGreaterThan(0);
      }
    );
  });

  describe('FEN & Move Validation with chess.js', () => {
    for (const scenario of ALL_SCENARIOS) {
      describe(`Scenario: ${scenario.id} (${scenario.title})`, () => {
        it('has sequentially numbered steps starting from 1', () => {
          scenario.steps.forEach((step: TutorialStep, index: number) => {
            expect(step.stepNumber).toBe(index + 1);
            expect(step.id).toBeTruthy();
            expect(step.instruction).toBeTruthy();
            expect(step.hint).toBeTruthy();
            expect(step.explanationOnSuccess).toBeTruthy();
          });
        });

        it('has valid FEN strings and legal allowedMoves for every step', () => {
          for (const step of scenario.steps) {
            // 1. Validate FEN parsing in chess.js
            let chess: Chess;
            expect(() => {
              chess = new Chess(step.setupFen);
            }).not.toThrow();

            chess = new Chess(step.setupFen);
            expect(chess.fen()).toBeTruthy();

            // 2. Verify non-empty valid allowedMoves
            expect(step.allowedMoves).toBeDefined();
            expect(Array.isArray(step.allowedMoves)).toBe(true);
            expect(step.allowedMoves!.length).toBeGreaterThan(0);

            // 3. Verify each allowed move is a valid legal chess move from current FEN
            for (const moveConstraint of step.allowedMoves!) {
              expect(moveConstraint.from).toMatch(/^[a-h][1-8]$/);
              expect(moveConstraint.to).toMatch(/^[a-h][1-8]$/);

              const testChess = new Chess(step.setupFen);
              const pieceAtSource = testChess.get(moveConstraint.from as any);
              expect(pieceAtSource).not.toBeNull();

              // Verify move legality in chess.js
              const moveResult = testChess.move({
                from: moveConstraint.from as any,
                to: moveConstraint.to as any,
                promotion: moveConstraint.promotion as any,
              });
              expect(moveResult).not.toBeNull();
            }

            // 4. Verify opponent response if present
            if (step.opponentResponse) {
              const resp = step.opponentResponse;
              expect(resp.from).toMatch(/^[a-h][1-8]$/);
              expect(resp.to).toMatch(/^[a-h][1-8]$/);
              expect(resp.dialogue).toBeTruthy();

              // Test applying player move then opponent response
              const flowChess = new Chess(step.setupFen);
              const firstAllowed = step.allowedMoves![0];
              flowChess.move({
                from: firstAllowed.from as any,
                to: firstAllowed.to as any,
                promotion: firstAllowed.promotion as any,
              });

              const botMoveResult = flowChess.move({
                from: resp.from as any,
                to: resp.to as any,
                promotion: resp.promotion as any,
              });
              expect(botMoveResult).not.toBeNull();
            }
          }
        });
      });
    }
  });

  describe('Scenario Lookup & Navigation Utilities', () => {
    it('retrieves scenario by id using getScenarioById', () => {
      const first = ALL_SCENARIOS[0];
      const retrieved = getScenarioById(first.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(first.id);

      const nonExistent = getScenarioById('non-existent-scenario-999');
      expect(nonExistent).toBeUndefined();
    });

    it('returns the next scenario correctly using getNextScenario', () => {
      const first = ALL_SCENARIOS[0];
      const second = ALL_SCENARIOS[1];
      const next = getNextScenario(first.id);
      expect(next).toBeDefined();
      expect(next?.id).toBe(second.id);

      const last = ALL_SCENARIOS[ALL_SCENARIOS.length - 1];
      const nextAfterLast = getNextScenario(last.id);
      expect(nextAfterLast).toBeNull();

      const invalidNext = getNextScenario('invalid-id');
      expect(invalidNext).toBeNull();
    });
  });
});
