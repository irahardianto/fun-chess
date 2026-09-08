import { describe, it, expect } from "vitest";
import {
  calculateStars,
  calculatePuzzleStars,
  calculateAccuracy,
  calculateAccuracyPercent,
} from "../star_calculator.js";

describe("Star Calculator & Accuracy Scoring Utility (MIN-023)", () => {
  describe("calculateStars()", () => {
    it("awards 3 stars for flawless completion (0 hints, 0 mistakes)", () => {
      expect(calculateStars(0, 0)).toBe(3);
      expect(calculateStars(0)).toBe(3); // default mistakesOrRetries = 0
    });

    it("awards 2 stars for <= 1 hint and <= 1 mistake with at least one imperfect action", () => {
      expect(calculateStars(1, 0)).toBe(2);
      expect(calculateStars(0, 1)).toBe(2);
      expect(calculateStars(1, 1)).toBe(2);
    });

    it("awards 1 star for 2 or more hints or 2 or more mistakes", () => {
      expect(calculateStars(2, 0)).toBe(1);
      expect(calculateStars(0, 2)).toBe(1);
      expect(calculateStars(2, 1)).toBe(1);
      expect(calculateStars(1, 2)).toBe(1);
      expect(calculateStars(5, 5)).toBe(1);
      expect(calculateStars(10, 0)).toBe(1);
    });

    it("sanitizes negative inputs defensively using Math.max(0, n)", () => {
      expect(calculateStars(-1, -1)).toBe(3);
      expect(calculateStars(-5, 0)).toBe(3);
      expect(calculateStars(0, -2)).toBe(3);
      expect(calculateStars(-1, 1)).toBe(2);
      expect(calculateStars(1, -5)).toBe(2);
    });
  });

  describe("calculatePuzzleStars() alias", () => {
    it("mirrors calculateStars logic with puzzle-specific nomenclature", () => {
      expect(calculatePuzzleStars(0, 0)).toBe(3);
      expect(calculatePuzzleStars(0)).toBe(3);
      expect(calculatePuzzleStars(1, 0)).toBe(2);
      expect(calculatePuzzleStars(0, 1)).toBe(2);
      expect(calculatePuzzleStars(1, 1)).toBe(2);
      expect(calculatePuzzleStars(2, 0)).toBe(1);
      expect(calculatePuzzleStars(0, 2)).toBe(1);
      expect(calculatePuzzleStars(3, 4)).toBe(1);
      expect(calculatePuzzleStars(-1, -2)).toBe(3);
    });
  });

  describe("calculateAccuracy()", () => {
    it("returns 100% accuracy when mistakesCount is 0", () => {
      expect(calculateAccuracy(5, 0)).toBe(100);
      expect(calculateAccuracy(1, 0)).toBe(100);
      expect(calculateAccuracy(10, -1)).toBe(100); // negative mistakes clamped to 0
    });

    it("computes proportional accuracy based on steps / (steps + mistakes)", () => {
      // 5 steps, 1 mistake: 5/6 = 83.33% -> 83
      expect(calculateAccuracy(5, 1)).toBe(83);
      // 5 steps, 5 mistakes: 5/10 = 50%
      expect(calculateAccuracy(5, 5)).toBe(50);
      // 10 steps, 2 mistakes: 10/12 = 83.33% -> 83
      expect(calculateAccuracy(10, 2)).toBe(83);
    });

    it("clamps lower bound at 10% for high mistake counts", () => {
      expect(calculateAccuracy(1, 100)).toBe(10);
      expect(calculateAccuracy(2, 500)).toBe(10);
    });

    it("safely handles totalSteps <= 0 by clamping to minimum 1 step", () => {
      expect(calculateAccuracy(0, 0)).toBe(100);
      expect(calculateAccuracy(-5, 0)).toBe(100);
      expect(calculateAccuracy(0, 1)).toBe(50); // 1 / (1 + 1) = 50%
    });
  });

  describe("calculateAccuracyPercent()", () => {
    it("returns 100% when total is 0 or negative", () => {
      expect(calculateAccuracyPercent(0, 0)).toBe(100);
      expect(calculateAccuracyPercent(5, 0)).toBe(100);
      expect(calculateAccuracyPercent(5, -1)).toBe(100);
    });

    it("calculates accurate percentages and rounds to nearest integer", () => {
      expect(calculateAccuracyPercent(5, 10)).toBe(50);
      expect(calculateAccuracyPercent(1, 3)).toBe(33);
      expect(calculateAccuracyPercent(2, 3)).toBe(67);
      expect(calculateAccuracyPercent(10, 10)).toBe(100);
      expect(calculateAccuracyPercent(0, 10)).toBe(0);
    });

    it("clamps output within [0, 100]", () => {
      expect(calculateAccuracyPercent(-5, 10)).toBe(0);
      expect(calculateAccuracyPercent(15, 10)).toBe(100);
    });
  });
});
