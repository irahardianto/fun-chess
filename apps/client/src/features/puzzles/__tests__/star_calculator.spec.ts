import { describe, it, expect } from 'vitest';
import { calculatePuzzleStars, calculateAccuracyPercent } from '../engine/star_calculator';

describe('Star Calculator & Accuracy', () => {
  it('awards 3 stars for clean solve (0 hints, 0 mistakes)', () => {
    expect(calculatePuzzleStars(0, 0)).toBe(3);
  });

  it('awards 2 stars for 1 hint or 1 mistake', () => {
    expect(calculatePuzzleStars(1, 0)).toBe(2);
    expect(calculatePuzzleStars(0, 1)).toBe(2);
    expect(calculatePuzzleStars(1, 1)).toBe(2);
  });

  it('always awards at least 1 star upon solving regardless of hints/retries (non-punitive)', () => {
    expect(calculatePuzzleStars(3, 2)).toBe(1);
    expect(calculatePuzzleStars(0, 4)).toBe(1);
  });

  it('calculates accuracy percentage', () => {
    expect(calculateAccuracyPercent(8, 10)).toBe(80);
    expect(calculateAccuracyPercent(0, 0)).toBe(100);
  });
});
