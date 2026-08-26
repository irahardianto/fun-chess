import { describe, it, expect } from 'vitest';
import { calculatePuzzleStars, calculateAccuracy } from '../star_calculator';

describe('Puzzle Star & Accuracy Calculator', () => {
  describe('calculatePuzzleStars', () => {
    it('awards 3 stars for clean solve with 0 hints and 0 mistakes', () => {
      expect(calculatePuzzleStars(0, 0)).toBe(3);
    });

    it('awards 2 stars for 1 hint or 1 mistake', () => {
      expect(calculatePuzzleStars(1, 0)).toBe(2);
      expect(calculatePuzzleStars(0, 1)).toBe(2);
      expect(calculatePuzzleStars(1, 1)).toBe(2);
    });

    it('awards at least 1 star for 2+ hints or 2+ mistakes', () => {
      expect(calculatePuzzleStars(2, 0)).toBe(1);
      expect(calculatePuzzleStars(0, 2)).toBe(1);
      expect(calculatePuzzleStars(3, 4)).toBe(1);
    });

    it('handles negative inputs safely', () => {
      expect(calculatePuzzleStars(-1, -2)).toBe(3);
    });
  });

  describe('calculateAccuracy', () => {
    it('returns 100% accuracy on zero mistakes', () => {
      expect(calculateAccuracy(10, 0)).toBe(100);
    });

    it('computes calibrated accuracy percentage on mistakes', () => {
      const acc = calculateAccuracy(10, 2);
      expect(acc).toBe(83);
    });

    it('clamps minimum accuracy to 10%', () => {
      const acc = calculateAccuracy(1, 50);
      expect(acc).toBe(10);
    });
  });
});
