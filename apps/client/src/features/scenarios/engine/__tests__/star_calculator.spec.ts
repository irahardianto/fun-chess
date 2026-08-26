import { describe, it, expect } from 'vitest';
import { calculateStars, calculateAccuracy } from '../star_calculator';

describe('star_calculator', () => {
  describe('calculateStars', () => {
    it('awards 3 Stars when 0 hints and 0 mistakes/retries are used', () => {
      expect(calculateStars(0, 0)).toBe(3);
      expect(calculateStars(0)).toBe(3); // default mistakes = 0
    });

    it('awards 2 Stars when exactly 1 hint is used with 0 mistakes', () => {
      expect(calculateStars(1, 0)).toBe(2);
    });

    it('awards 2 Stars when 0 hints are used with exactly 1 mistake', () => {
      expect(calculateStars(0, 1)).toBe(2);
    });

    it('awards 2 Stars when 1 hint and 1 mistake are used', () => {
      expect(calculateStars(1, 1)).toBe(2);
    });

    it('awards 1 Star when 2 or more hints are used', () => {
      expect(calculateStars(2, 0)).toBe(1);
      expect(calculateStars(3, 0)).toBe(1);
      expect(calculateStars(5, 1)).toBe(1);
    });

    it('awards 1 Star when 2 or more mistakes/retries are made', () => {
      expect(calculateStars(0, 2)).toBe(1);
      expect(calculateStars(0, 4)).toBe(1);
      expect(calculateStars(1, 2)).toBe(1);
    });

    it('always awards at least 1 Star to encourage young learners even with high hints and retries', () => {
      expect(calculateStars(10, 20)).toBe(1);
    });

    it('defends against negative inputs gracefully by clamping to 0', () => {
      expect(calculateStars(-1, -2)).toBe(3);
      expect(calculateStars(-5, 1)).toBe(2);
      expect(calculateStars(1, -3)).toBe(2);
    });
  });

  describe('calculateAccuracy', () => {
    it('returns 100% when there are 0 mistakes', () => {
      expect(calculateAccuracy(5, 0)).toBe(100);
      expect(calculateAccuracy(1, 0)).toBe(100);
    });

    it('calculates accuracy percentage accurately based on total steps vs mistakes', () => {
      // 5 steps, 1 mistake => 5 / (5 + 1) = 83.33% => 83%
      expect(calculateAccuracy(5, 1)).toBe(83);

      // 4 steps, 2 mistakes => 4 / (4 + 2) = 66.66% => 67%
      expect(calculateAccuracy(4, 2)).toBe(67);

      // 1 step, 1 mistake => 1 / 2 = 50%
      expect(calculateAccuracy(1, 1)).toBe(50);
    });

    it('clamps minimum accuracy to 10% to stay encouraging for children', () => {
      // 1 step, 50 mistakes => ratio 1/51 ~ 2% => clamped to 10%
      expect(calculateAccuracy(1, 50)).toBe(10);
    });

    it('safely handles 0 or negative step counts', () => {
      expect(calculateAccuracy(0, 0)).toBe(100);
      expect(calculateAccuracy(-2, 0)).toBe(100);
      expect(calculateAccuracy(0, 1)).toBe(50); // treated as safeTotal = 1
    });

    it('safely handles negative mistakes count', () => {
      expect(calculateAccuracy(5, -3)).toBe(100);
    });
  });
});
