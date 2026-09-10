import { describe, it, expect } from 'vitest';
import {
  ALL_PUZZLES,
  FORK_PUZZLES,
  PIN_PUZZLES,
  getPuzzleById,
  getPuzzlesByTheme,
  getPuzzlesByDifficulty,
  getPuzzlesByRatingBand,
  getClosestPuzzleToRating,
  getRandomPuzzle,
  getPuzzlePackMetadata,
  extractPuzzleThemes,
} from '../puzzle_catalog';
import type { Puzzle, PuzzleTheme } from '@fun-chess/shared';

describe('puzzle_catalog query & metadata functions', () => {
  it('loads curated puzzle packs into ALL_PUZZLES collection', () => {
    expect(ALL_PUZZLES.length).toBeGreaterThan(50);
    expect(FORK_PUZZLES.length).toBeGreaterThan(0);
    expect(PIN_PUZZLES.length).toBeGreaterThan(0);
  });

  describe('getPuzzleById', () => {
    it('returns the puzzle when ID exists', () => {
      const first = ALL_PUZZLES[0];
      expect(first).toBeDefined();
      const found = getPuzzleById(first!.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(first!.id);
    });

    it('returns undefined when ID does not exist', () => {
      const found = getPuzzleById('puz_does_not_exist_99999');
      expect(found).toBeUndefined();
    });
  });

  describe('getPuzzlesByTheme', () => {
    it('returns puzzles directly tagged with the requested theme', () => {
      const forks = getPuzzlesByTheme('fork');
      expect(forks.length).toBeGreaterThan(0);
      expect(forks.some((p) => p.themes.includes('fork'))).toBe(true);
    });

    it('resolves aliased themes when direct lookup falls back', () => {
      const decoyPuzzles = getPuzzlesByTheme('decoy');
      expect(decoyPuzzles.length).toBeGreaterThan(0);

      const anastasiaPuzzles = getPuzzlesByTheme('anastasia_mate');
      expect(anastasiaPuzzles.length).toBeGreaterThan(0);

      const smotheredPuzzles = getPuzzlesByTheme('smothered_mate');
      expect(smotheredPuzzles.length).toBeGreaterThan(0);

      const endgamePuzzles = getPuzzlesByTheme('pawn_endgame');
      expect(endgamePuzzles.length).toBeGreaterThan(0);
    });

    it('returns empty array when neither direct nor alias finds any puzzles', () => {
      const empty = getPuzzlesByTheme('nonexistent_theme_xyz' as PuzzleTheme);
      expect(empty).toEqual([]);
    });
  });

  describe('getPuzzlesByDifficulty', () => {
    it('returns puzzles matching calibrated difficulty tiers', () => {
      const novice = getPuzzlesByDifficulty('novice');
      const easy = getPuzzlesByDifficulty('easy');
      const medium = getPuzzlesByDifficulty('medium');
      const hard = getPuzzlesByDifficulty('hard');

      expect(novice.length).toBeGreaterThan(0);
      expect(novice.every((p) => p.difficulty === 'novice')).toBe(true);
      expect(easy.length).toBeGreaterThan(0);
      expect(medium.length).toBeGreaterThan(0);
      expect(hard.length).toBeGreaterThan(0);
    });
  });

  describe('getPuzzlesByRatingBand', () => {
    it('returns puzzles within inclusive min and max rating bounds', () => {
      const puzzles = getPuzzlesByRatingBand(800, 1000);
      expect(puzzles.length).toBeGreaterThan(0);
      expect(puzzles.every((p) => p.rating >= 800 && p.rating <= 1000)).toBe(true);
    });
  });

  describe('getClosestPuzzleToRating', () => {
    it('finds puzzle closest to target rating', () => {
      const closest = getClosestPuzzleToRating(750);
      expect(closest).not.toBeNull();
      expect(Math.abs(closest!.rating - 750)).toBeLessThan(300);
    });

    it('excludes specified puzzle IDs', () => {
      const firstChoice = getClosestPuzzleToRating(750);
      expect(firstChoice).not.toBeNull();

      const secondChoice = getClosestPuzzleToRating(750, [firstChoice!.id]);
      expect(secondChoice).not.toBeNull();
      expect(secondChoice!.id).not.toBe(firstChoice!.id);
    });

    it('falls back to closest available puzzle when all IDs in catalog are excluded', () => {
      const allIds = ALL_PUZZLES.map((p) => p.id);
      const fallback = getClosestPuzzleToRating(900, allIds);
      expect(fallback).not.toBeNull();
      expect(ALL_PUZZLES).toContain(fallback);
    });
  });

  describe('getRandomPuzzle', () => {
    it('returns a random puzzle from full catalog when no params provided', () => {
      const puzzle = getRandomPuzzle();
      expect(puzzle).toBeDefined();
      expect(puzzle.id).toBeDefined();
    });

    it('returns a puzzle for specified theme', () => {
      const forkPuzzle = getRandomPuzzle('fork');
      expect(forkPuzzle).toBeDefined();
      expect(forkPuzzle.themes).toContain('fork');
    });

    it('falls back to all puzzles when requested theme has no puzzles', () => {
      const fallback = getRandomPuzzle('nonexistent_theme_random' as PuzzleTheme);
      expect(fallback).toBeDefined();
      expect(ALL_PUZZLES).toContain(fallback);
    });

    it('selects from closest puzzles when targetRating is provided', () => {
      const ratedPuzzle = getRandomPuzzle('fork', 800);
      expect(ratedPuzzle).toBeDefined();
      expect(ratedPuzzle.rating).toBeGreaterThan(0);
    });

    it('uses injected randomFn for deterministic puzzle selection (MAJ-013, MIN-023)', () => {
      const deterministicRandom = () => 0; // Always pick index 0
      const puzzle1 = getRandomPuzzle('fork', undefined, deterministicRandom);
      const puzzle2 = getRandomPuzzle('fork', undefined, deterministicRandom);
      expect(puzzle1.id).toBe(puzzle2.id);

      const rated1 = getRandomPuzzle('fork', 800, deterministicRandom);
      const rated2 = getRandomPuzzle('fork', 800, deterministicRandom);
      expect(rated1.id).toBe(rated2.id);
    });
  });

  describe('getPuzzlePackMetadata', () => {
    it('generates consistent metadata for offline puzzle catalog', () => {
      const meta = getPuzzlePackMetadata();
      expect(meta.version).toBe('2.0.0');
      expect(meta.totalPuzzles).toBe(ALL_PUZZLES.length);
      expect(meta.themeDistribution['fork']).toBeGreaterThan(0);
      expect(meta.themeDistribution['smothered_mate']).toBeGreaterThan(0);
      expect(meta.themeDistribution['anastasia_mate']).toBeGreaterThan(0);
      expect(meta.ratingDistribution.novice).toBeGreaterThan(0);
      expect(meta.ratingDistribution.easy).toBeGreaterThan(0);
    });
  });

  describe('extractPuzzleThemes', () => {
    it('extracts primary theme and applies thematic heuristics', () => {
      const samplePuzzle = {
        id: 'test_extract_1',
        fen: '4k3/8/8/8/8/8/8/4K2R w - - 0 1',
        moves: ['h1h8'],
        rating: 800,
        ratingDeviation: 50,
        themes: ['fork'],
        primaryTheme: 'fork',
        difficulty: 'novice',
        title: 'Back-Rank Checkmate Surprise',
        subtitle: 'Test',
        playerColor: 'w',
        solutionPlies: 1,
      } as unknown as Puzzle;

      const extracted = extractPuzzleThemes(samplePuzzle);
      expect(extracted.has('fork')).toBe(true);
    });

    it('applies mate_depth rules for plies 1, 3, and 5', () => {
      const base = {
        id: 'puz_mate_test',
        fen: '8/8/8/8/8/8/8/8 w - - 0 1',
        rating: 1000,
        ratingDeviation: 50,
        themes: [],
        primaryTheme: 'checkmate' as PuzzleTheme,
        difficulty: 'easy',
        title: 'Mate',
        playerColor: 'w',
        tacticalReward: 'checkmate',
      };

      const m1 = extractPuzzleThemes({ ...base, solutionPlies: 1, moves: ['a1a8'] } as unknown as Puzzle);
      expect(m1.has('mate_in_1')).toBe(true);

      const m2 = extractPuzzleThemes({ ...base, solutionPlies: 3, moves: ['a1a8', 'b8c8', 'a8c8'] } as unknown as Puzzle);
      expect(m2.has('mate_in_2')).toBe(true);

      const m3 = extractPuzzleThemes({ ...base, solutionPlies: 5, moves: ['a', 'b', 'c', 'd', 'e'] } as unknown as Puzzle);
      expect(m3.has('mate_in_3')).toBe(true);
    });

    it('applies hanging, trapped, clearance, and battery rules', () => {
      const p = {
        id: 'puz_multi_test',
        fen: '8/8/8/8/8/8/8/8 w - - 0 1',
        moves: ['a1a8'],
        rating: 1000,
        ratingDeviation: 50,
        themes: [],
        primaryTheme: 'hanging_piece',
        difficulty: 'easy',
        title: 'Trapped Queen Clearance Battery',
        subtitle: 'Boxed in free piece opens the h-file doubled rooks',
        playerColor: 'w',
        tacticalGoal: 'snatch undefended piece',
        learningSummary: 'clear the file and trap',
        keyTakeaway: 'cornered no escape',
      } as unknown as Puzzle;

      const themes = extractPuzzleThemes(p);
      expect(themes.has('hanging_piece')).toBe(true);
      expect(themes.has('trapped_piece')).toBe(true);
      expect(themes.has('clearance')).toBe(true);
      expect(themes.has('battery')).toBe(true);
    });

    it('applies scholars mate, fried liver, and legals trap rules', () => {
      const pScholar = {
        id: 'puz_scholar_test',
        fen: '8/8/8/8/8/8/8/8 w - - 0 1',
        moves: ['d1f7'],
        rating: 800,
        ratingDeviation: 50,
        themes: [],
        primaryTheme: 'scholars_mate',
        difficulty: 'novice',
        title: "Scholar's checkmate attack",
        playerColor: 'w',
        tacticalGoal: 'queen and bishop strike on f7',
        learningSummary: 'quick checkmate',
        keyTakeaway: 'protect f7',
      } as unknown as Puzzle;
      expect(extractPuzzleThemes(pScholar).has('scholars_mate')).toBe(true);

      const pFried = {
        id: 'puz_fried_test',
        fen: '8/8/8/8/8/8/8/8 w - - 0 1',
        moves: ['g1f7'],
        rating: 1100,
        ratingDeviation: 50,
        themes: [],
        primaryTheme: 'fork',
        difficulty: 'easy',
        title: 'Fried Liver Attack',
        playerColor: 'w',
        tacticalGoal: 'knight on f7',
        learningSummary: 'fork king and rook',
        keyTakeaway: 'knight sacrifice',
      } as unknown as Puzzle;
      expect(extractPuzzleThemes(pFried).has('fried_liver')).toBe(true);

      const pLegal = {
        id: 'puz_legal_test',
        fen: '8/8/8/8/8/8/8/8 w - - 0 1',
        moves: ['e1e2'],
        rating: 1200,
        ratingDeviation: 50,
        themes: [],
        primaryTheme: 'discovered_attack',
        difficulty: 'medium',
        title: "Légal's Pseudo-Sacrifice",
        playerColor: 'w',
        tacticalGoal: 'nxe5 winning the queen',
        learningSummary: 'legals trap',
        keyTakeaway: 'queen deflection',
      } as unknown as Puzzle;
      expect(extractPuzzleThemes(pLegal).has('legals_trap')).toBe(true);
    });
  });
});
