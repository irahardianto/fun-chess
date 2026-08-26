import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  ALL_PUZZLES,
  FORK_PUZZLES,
  PIN_PUZZLES,
  SKEWER_PUZZLES,
  DISCOVERED_CHECK_PUZZLES,
  DEFLECTION_DECOY_PUZZLES,
  GREEK_GIFT_PUZZLES,
  WINDMILL_PUZZLES,
  BACK_RANK_PUZZLES,
  ANASTASIA_HOOK_PUZZLES,
  SMOTHERED_PUZZLES,
  ENDGAME_CONVERSION_PUZZLES,
  getPuzzleById,
  getPuzzlesByTheme,
  getPuzzlesByDifficulty,
  getPuzzlesByRatingBand,
  getClosestPuzzleToRating,
  getRandomPuzzle,
  getPuzzlePackMetadata,
  ALL_PUZZLE_THEMES,
  getThemeDescriptor,
  getThemesByCategory,
} from '../index';

describe('Offline Puzzle Pack Integrity & Validation', () => {
  it('loads all 11 curated puzzle packs with a minimum count of 300 puzzles', () => {
    expect(ALL_PUZZLES.length).toBeGreaterThanOrEqual(300);
    expect(FORK_PUZZLES.length).toBeGreaterThanOrEqual(30);
    expect(PIN_PUZZLES.length).toBeGreaterThanOrEqual(30);
    expect(SKEWER_PUZZLES.length).toBeGreaterThanOrEqual(25);
    expect(DISCOVERED_CHECK_PUZZLES.length).toBeGreaterThanOrEqual(25);
    expect(DEFLECTION_DECOY_PUZZLES.length).toBeGreaterThanOrEqual(25);
    expect(GREEK_GIFT_PUZZLES.length).toBeGreaterThanOrEqual(25);
    expect(WINDMILL_PUZZLES.length).toBeGreaterThanOrEqual(25);
    expect(BACK_RANK_PUZZLES.length).toBeGreaterThanOrEqual(30);
    expect(ANASTASIA_HOOK_PUZZLES.length).toBeGreaterThanOrEqual(25);
    expect(SMOTHERED_PUZZLES.length).toBeGreaterThanOrEqual(25);
    expect(ENDGAME_CONVERSION_PUZZLES.length).toBeGreaterThanOrEqual(30);
  });

  it('validates that every single puzzle in the library has legal FEN and legal UCI moves in chess.js', () => {
    for (const puzzle of ALL_PUZZLES) {
      expect(puzzle.id).toBeTruthy();
      expect(puzzle.title).toBeTruthy();
      expect(puzzle.subtitle).toBeTruthy();
      expect(puzzle.rating).toBeGreaterThan(0);
      expect(puzzle.ratingDeviation).toBeGreaterThan(0);
      expect(puzzle.themes.length).toBeGreaterThan(0);
      expect(puzzle.moves.length).toBeGreaterThan(0);
      expect(puzzle.solutionPlies).toBe(puzzle.moves.length);
      expect(['w', 'b']).toContain(puzzle.playerColor);
      expect(['novice', 'easy', 'medium', 'hard', 'expert']).toContain(puzzle.difficulty);

      // Verify FEN loads in chess.js
      const chess = new Chess(puzzle.fen);
      expect(chess.fen()).toBeTruthy();

      // Verify every move in moves array is completely legal
      for (const moveUci of puzzle.moves) {
        const from = moveUci.slice(0, 2);
        const to = moveUci.slice(2, 4);
        const promo = moveUci.slice(4) || undefined;
        const res = chess.move({ from, to, promotion: promo });
        expect(res).not.toBeNull();
      }
    }
  });

  describe('Puzzle Catalog Queries', () => {
    it('retrieves puzzle by ID correctly', () => {
      const p = ALL_PUZZLES[0];
      const found = getPuzzleById(p.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(p.id);
    });

    it('filters puzzles by theme', () => {
      const forks = getPuzzlesByTheme('fork');
      expect(forks.length).toBeGreaterThan(0);
      expect(forks.every((p) => p.themes.includes('fork'))).toBe(true);
    });

    it('filters puzzles by difficulty tier', () => {
      const novice = getPuzzlesByDifficulty('novice');
      expect(novice.length).toBeGreaterThan(0);
      expect(novice.every((p) => p.difficulty === 'novice')).toBe(true);
    });

    it('filters puzzles by rating band', () => {
      const band = getPuzzlesByRatingBand(800, 1000);
      expect(band.length).toBeGreaterThan(0);
      expect(band.every((p) => p.rating >= 800 && p.rating <= 1000)).toBe(true);
    });

    it('finds the closest puzzle to target rating', () => {
      const target = 1150;
      const closest = getClosestPuzzleToRating(target);
      expect(closest).toBeDefined();
      expect(Math.abs(closest!.rating - target)).toBeLessThan(300);
    });

    it('excludes specified puzzle IDs when finding closest puzzle', () => {
      const first = ALL_PUZZLES[0];
      const next = getClosestPuzzleToRating(first.rating, [first.id]);
      expect(next).toBeDefined();
      expect(next?.id).not.toBe(first.id);
    });

    it('returns a random puzzle within expected rating or theme', () => {
      const randomP = getRandomPuzzle('pin', 900);
      expect(randomP).toBeDefined();
      expect(randomP.themes).toContain('pin');
    });

    it('generates puzzle pack metadata accurately', () => {
      const meta = getPuzzlePackMetadata();
      expect(meta.totalPuzzles).toBe(ALL_PUZZLES.length);
      expect(meta.version).toBe('2.0.0');
      expect(meta.ratingDistribution.novice).toBeGreaterThan(0);
      expect(meta.themeDistribution['fork']).toBeGreaterThan(0);
    });
  });

  describe('Theme Descriptors', () => {
    it('retrieves theme descriptors by ID and category', () => {
      expect(ALL_PUZZLE_THEMES.length).toBeGreaterThanOrEqual(15);

      const forkDesc = getThemeDescriptor('fork');
      expect(forkDesc).toBeDefined();
      expect(forkDesc?.name).toContain('Fork');
      expect(forkDesc?.category).toBe('basic_tactics');

      const basicThemes = getThemesByCategory('basic_tactics');
      expect(basicThemes.length).toBeGreaterThanOrEqual(4);
      expect(basicThemes.some((t) => t.id === 'pin')).toBe(true);
    });
  });
});
