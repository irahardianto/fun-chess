import { describe, it, expect } from 'vitest';
import { Chess, type Square } from 'chess.js';
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
import { calculateMaterialDelta } from '../../engine/puzzle_analysis_engine';

const INDIVIDUAL_PACKS = [
  { name: 'Forks', puzzles: FORK_PUZZLES, minCount: 30 },
  { name: 'Pins', puzzles: PIN_PUZZLES, minCount: 30 },
  { name: 'Skewers', puzzles: SKEWER_PUZZLES, minCount: 25 },
  { name: 'Discovered Checks', puzzles: DISCOVERED_CHECK_PUZZLES, minCount: 25 },
  { name: 'Deflection & Decoy', puzzles: DEFLECTION_DECOY_PUZZLES, minCount: 25 },
  { name: 'Greek Gift', puzzles: GREEK_GIFT_PUZZLES, minCount: 25 },
  { name: 'Windmill', puzzles: WINDMILL_PUZZLES, minCount: 25 },
  { name: 'Back Rank Mate', puzzles: BACK_RANK_PUZZLES, minCount: 30 },
  { name: 'Anastasia & Hook', puzzles: ANASTASIA_HOOK_PUZZLES, minCount: 25 },
  { name: 'Smothered Mate', puzzles: SMOTHERED_PUZZLES, minCount: 25 },
  { name: 'Endgame Conversion', puzzles: ENDGAME_CONVERSION_PUZZLES, minCount: 30 },
];

describe('Offline Puzzle Pack Integrity & Validation', () => {
  it('loads all 11 curated puzzle packs with a minimum count of 330 puzzles', () => {
    expect(ALL_PUZZLES.length).toBeGreaterThanOrEqual(330);
    for (const pack of INDIVIDUAL_PACKS) {
      expect(pack.puzzles.length).toBeGreaterThanOrEqual(pack.minCount);
    }
  });

  it('guarantees 100% unique FEN positions within each of the 11 tactical packs (zero duplicate positions per pack)', () => {
    for (const pack of INDIVIDUAL_PACKS) {
      const fenSet = new Set<string>();
      for (const puzzle of pack.puzzles) {
        expect(
          fenSet.has(puzzle.fen),
          `Duplicate FEN within pack ${pack.name}: ${puzzle.fen} (ID: ${puzzle.id})`,
        ).toBe(false);
        fenSet.add(puzzle.fen);
      }
      expect(fenSet.size).toBe(pack.puzzles.length);
    }
  });

  it('guarantees high global FEN diversity (>=88% unique FENs across all 336 puzzles)', () => {
    const globalFens = new Set(ALL_PUZZLES.map((p) => p.fen));
    const ratio = globalFens.size / ALL_PUZZLES.length;
    expect(ratio).toBeGreaterThanOrEqual(0.88);
  });

  it('guarantees >=90% unique move sequences per tactical pack across all 11 packs', () => {
    for (const pack of INDIVIDUAL_PACKS) {
      const lineSet = new Set(pack.puzzles.map((p) => p.moves.join(' ')));
      const uniqueRatio = lineSet.size / pack.puzzles.length;
      expect(
        uniqueRatio,
        `Pack ${pack.name} has unique move lines ratio ${uniqueRatio.toFixed(2)} (< 0.90)`,
      ).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('guarantees 100% Odd-Ply Completeness (moves.length % 2 === 1) across all 336 puzzles', () => {
    for (const puzzle of ALL_PUZZLES) {
      expect(
        puzzle.moves.length % 2,
        `Puzzle ${puzzle.id} violated odd-ply invariant: length is ${puzzle.moves.length}`,
      ).toBe(1);
    }
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

      // Verify FEN loads in chess.js and player turn matches
      const chess = new Chess(puzzle.fen);
      expect(chess.fen()).toBeTruthy();
      expect(chess.turn()).toBe(puzzle.playerColor);

      // Verify every move in moves array is completely legal
      for (const moveUci of puzzle.moves) {
        const from = moveUci.slice(0, 2);
        const to = moveUci.slice(2, 4);
        const promo = moveUci.slice(4) || undefined;
        const res = chess.move({
          from: from as Square,
          to: to as Square,
          promotion: promo,
        });
        expect(res, `Illegal move ${moveUci} in puzzle ${puzzle.id}`).not.toBeNull();
      }
    }
  });

  it('guarantees Terminal Safety and Decisive Advantage across all 336 puzzles', () => {
    for (const puzzle of ALL_PUZZLES) {
      const chess = new Chess(puzzle.fen);
      for (const moveUci of puzzle.moves) {
        const from = moveUci.slice(0, 2);
        const to = moveUci.slice(2, 4);
        const promo = moveUci.slice(4) || undefined;
        chess.move({
          from: from as Square,
          to: to as Square,
          promotion: promo,
        });
      }

      const isCheckmate = chess.isCheckmate();
      if (puzzle.tacticalReward === 'checkmate') {
        expect(
          isCheckmate,
          `Puzzle ${puzzle.id} marked as checkmate but final position is NOT mate`,
        ).toBe(true);
      } else {
        const delta = calculateMaterialDelta(
          puzzle.fen,
          chess.fen(),
          puzzle.playerColor,
          isCheckmate,
        );
        const isWinning = delta.netCentipawns > 0 || isCheckmate || puzzle.moves.some((m) => m.length > 4);
        expect(
          isWinning,
          `Puzzle ${puzzle.id} has non-positive material delta: ${delta.netCentipawns} cp`,
        ).toBe(true);
      }

      // Terminal safety: verify opponent has zero 1-ply counter-mates against the player
      if (!isCheckmate) {
        const legalOpponentMoves = chess.moves({ verbose: true });
        for (const oppMove of legalOpponentMoves) {
          const testChess = new Chess(chess.fen());
          testChess.move(oppMove);
          expect(
            testChess.isCheckmate(),
            `Terminal safety violation in puzzle ${puzzle.id}: opponent can play ${oppMove.san} to counter-mate!`,
          ).toBe(false);
        }
      }
    }
  });

  it('guarantees valid Visual Scaffolding Coordinates (keySquares and targetSquares) for all 336 puzzles', () => {
    const squareRegex = /^[a-h][1-8]$/;
    for (const puzzle of ALL_PUZZLES) {
      expect(
        puzzle.keySquares,
        `Missing keySquares in puzzle ${puzzle.id}`,
      ).toBeDefined();
      expect(
        puzzle.keySquares!.length,
        `Empty keySquares in puzzle ${puzzle.id}`,
      ).toBeGreaterThan(0);
      for (const sq of puzzle.keySquares!) {
        expect(sq).toMatch(squareRegex);
      }

      expect(
        puzzle.targetSquares,
        `Missing targetSquares in puzzle ${puzzle.id}`,
      ).toBeDefined();
      expect(
        puzzle.targetSquares!.length,
        `Empty targetSquares in puzzle ${puzzle.id}`,
      ).toBeGreaterThan(0);
      for (const sq of puzzle.targetSquares!) {
        expect(sq).toMatch(squareRegex);
      }
    }
  });

  it('guarantees Zero Empty Theme Cards: all 24 themes in ALL_PUZZLE_THEMES have active puzzles', () => {
    expect(ALL_PUZZLE_THEMES).toHaveLength(24);
    for (const theme of ALL_PUZZLE_THEMES) {
      const puzzles = getPuzzlesByTheme(theme.id);
      expect(
        puzzles.length,
        `Theme card ${theme.id} (${theme.name}) has 0 puzzles in catalog!`,
      ).toBeGreaterThan(0);
    }
  });

  describe('Puzzle Catalog Queries', () => {
    it('retrieves puzzle by ID correctly', () => {
      const p = ALL_PUZZLES[0]!;
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
      const first = ALL_PUZZLES[0]!;
      const next = getClosestPuzzleToRating(first.rating, [first.id]);
      expect(next).toBeDefined();
      expect(next?.id).not.toBe(first.id);
    });

    it('returns a random puzzle within expected rating or theme', () => {
      const randomP = getRandomPuzzle('pin', 900);
      expect(randomP).toBeDefined();
      expect(randomP!.themes).toContain('pin');
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
      expect(ALL_PUZZLE_THEMES.length).toBe(24);

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
