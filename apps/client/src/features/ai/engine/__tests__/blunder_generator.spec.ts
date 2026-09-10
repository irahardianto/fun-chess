import { describe, it, expect } from 'vitest';
import type { AiSearchConfig } from '@fun-chess/shared';
import {
  shouldTriggerBlunder,
  applyEvaluationNoise,
  selectBlunderMove,
  chooseFinalMove,
  createSeededPrng,
  type EvaluatedCandidateMove,
} from '../blunder_generator.js';

describe('Blunder Generator (Calibrated Mistake & Noise Model)', () => {
  const sampleCandidates: EvaluatedCandidateMove[] = [
    { move: { from: 'e2', to: 'e4' }, score: 30, aiScore: 30 },
    { move: { from: 'd2', to: 'd4' }, score: 20, aiScore: 20 },
    { move: { from: 'g1', to: 'f3' }, score: -50, aiScore: -50 },
    { move: { from: 'f2', to: 'f3' }, score: -400, aiScore: -400 },
  ];

  describe('Blunder Trigger Probability Logic', () => {
    it('evaluates probability thresholds and boundary limits', () => {
      // 0% probability never triggers
      expect(shouldTriggerBlunder(0)).toBe(false);
      expect(shouldTriggerBlunder(-0.1)).toBe(false);

      // 100% probability always triggers
      expect(shouldTriggerBlunder(1)).toBe(true);
      expect(shouldTriggerBlunder(1.5)).toBe(true);

      const mockRandomLow = () => 0.15;
      const mockRandomHigh = () => 0.85;

      // 30% chance triggers on 0.15, misses on 0.85
      expect(shouldTriggerBlunder(0.3, mockRandomLow)).toBe(true);
      expect(shouldTriggerBlunder(0.3, mockRandomHigh)).toBe(false);
    });

    it('models calibrated mascot tier blunder probabilities', () => {
      // Peanut ~40%, Sparky ~20%, Fox ~5%, Owl 0%
      const peanutBlunderChance = 0.4;
      const sparkyBlunderChance = 0.2;
      const foxBlunderChance = 0.05;
      const owlBlunderChance = 0.0;

      expect(shouldTriggerBlunder(peanutBlunderChance, () => 0.35)).toBe(true);
      expect(shouldTriggerBlunder(sparkyBlunderChance, () => 0.35)).toBe(false);
      expect(shouldTriggerBlunder(foxBlunderChance, () => 0.02)).toBe(true);
      expect(shouldTriggerBlunder(owlBlunderChance, () => 0.0001)).toBe(false);
    });
  });

  describe('Evaluation Noise Model', () => {
    it('applies calibrated evaluation noise symmetrically around 0', () => {
      expect(applyEvaluationNoise(100, 0)).toBe(100);

      // randomFn returns 0.5 -> (0.5 * 2 - 1) = 0 -> noise = 0
      expect(applyEvaluationNoise(100, 20, () => 0.5)).toBe(100);

      // randomFn returns 1.0 -> (1.0 * 2 - 1) = +1 -> noise = +20
      expect(applyEvaluationNoise(100, 20, () => 1.0)).toBe(120);

      // randomFn returns 0.0 -> (0.0 * 2 - 1) = -1 -> noise = -20
      expect(applyEvaluationNoise(100, 20, () => 0.0)).toBe(80);
    });
  });

  describe('Suboptimal Move Selection & Score Drop Windows', () => {
    it('selects blunder move within maxScoreDrop boundary', () => {
      // best is 30. candidates: 20 (drop 10), -50 (drop 80), -400 (drop 430)
      // with maxScoreDrop 100, eligible are d4 (drop 10) and Nf3 (drop 80)
      const blunderFirst = selectBlunderMove(sampleCandidates, 100, () => 0);
      expect(blunderFirst).not.toBeNull();
      expect(blunderFirst?.move.from).toBe('d2');

      const blunderSecond = selectBlunderMove(sampleCandidates, 100, () => 0.99);
      expect(blunderSecond).not.toBeNull();
      expect(blunderSecond?.move.from).toBe('g1');
    });

    it('falls back to second best move when no candidates match strict drop window', () => {
      // best is 30. All other moves have score drop > 5.
      // With maxScoreDrop 5, no candidate is in drop window, so it falls back to candidate[1] (d2->d4)
      const fallback = selectBlunderMove(sampleCandidates, 5);
      expect(fallback).not.toBeNull();
      expect(fallback?.move.from).toBe('d2');
    });

    it('returns null when candidate list has only 1 move', () => {
      const single: EvaluatedCandidateMove[] = [
        { move: { from: 'e2', to: 'e4' }, score: 0, aiScore: 0 },
      ];
      expect(selectBlunderMove(single, 100)).toBeNull();
    });
  });

  describe('Final Move Selection Integration', () => {
    const baseConfig: AiSearchConfig = {
      depth: 3,
      blunderChance: 0,
      maxBlunderScoreDrop: 100,
      evaluationNoise: 0,
      usePst: true,
      useQuiescence: true,
      simulatedThinkTimeMs: [0, 0],
    };

    it('chooses optimal best move when blunderChance is 0 and noise is 0', () => {
      const result = chooseFinalMove(sampleCandidates, baseConfig);
      expect(result.isBlunder).toBe(false);
      expect(result.selected.move.from).toBe('e2');
      expect(result.selected.aiScore).toBe(30);
    });

    it('injects blunder when blunderChance is triggered', () => {
      const blunderConfig: AiSearchConfig = {
        ...baseConfig,
        blunderChance: 1.0,
      };

      const result = chooseFinalMove(sampleCandidates, blunderConfig, () => 0);
      expect(result.isBlunder).toBe(true);
      expect(result.selected.move.from).toBe('d2');
    });

    it('selects among close moves when evaluationNoise is enabled and moves are within noise window', () => {
      // Moves: e2 (30), d2 (20). Difference is 10.
      // With noise = 15, both e2 and d2 are eligible top moves.
      const noisyConfig: AiSearchConfig = {
        ...baseConfig,
        evaluationNoise: 15,
      };

      // Mock randomFn picks the 2nd eligible move (d2)
      const mockPickSecond = () => 0.9;
      const result = chooseFinalMove(sampleCandidates, noisyConfig, mockPickSecond);
      expect(result.isBlunder).toBe(false);
      expect(result.selected.move.from).toBe('d2');
    });

    it('handles single candidate without blundering or throwing', () => {
      const single: EvaluatedCandidateMove[] = [
        { move: { from: 'e7', to: 'e8', promotion: 'q' }, score: 900, aiScore: 900 },
      ];
      const result = chooseFinalMove(single, { ...baseConfig, blunderChance: 1.0 });
      expect(result.isBlunder).toBe(false);
      expect(result.selected.move.from).toBe('e7');
    });

    it('throws descriptive error when candidate list is empty', () => {
      expect(() => chooseFinalMove([], baseConfig)).toThrow(
        'Cannot choose final move from empty candidate list',
      );
    });
  });

  describe('createSeededPrng (MAJ-017)', () => {
    it('produces deterministic pseudorandom sequence from same seed', () => {
      const prng1 = createSeededPrng(42);
      const prng2 = createSeededPrng(42);

      const seq1 = [prng1(), prng1(), prng1()];
      const seq2 = [prng2(), prng2(), prng2()];

      expect(seq1).toEqual(seq2);
      expect(seq1[0]).toBeGreaterThanOrEqual(0);
      expect(seq1[0]).toBeLessThan(1);
    });

    it('produces different sequences from different seeds', () => {
      const prng1 = createSeededPrng(100);
      const prng2 = createSeededPrng(200);

      expect(prng1()).not.toBe(prng2());
    });
  });
});
