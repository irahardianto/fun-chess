import type {
  Puzzle,
  PuzzleTheme,
  PuzzleDifficultyTier,
  PuzzlePackMetadata,
} from '@fun-chess/shared';

// Import raw JSON puzzle packs
import forksJson from './forks.json';
import pinsJson from './pins.json';
import skewersJson from './skewers.json';
import discoveredChecksJson from './discovered_checks.json';
import deflectionDecoyJson from './deflection_decoy.json';
import greekGiftJson from './greek_gift.json';
import windmillJson from './windmill.json';
import backRankJson from './back_rank.json';
import anastasiaHookJson from './anastasia_hook.json';
import smotheredJson from './smothered.json';
import endgameConversionJson from './endgame_conversion.json';

export const FORK_PUZZLES: readonly Puzzle[] = forksJson as unknown as Puzzle[];
export const PIN_PUZZLES: readonly Puzzle[] = pinsJson as unknown as Puzzle[];
export const SKEWER_PUZZLES: readonly Puzzle[] = skewersJson as unknown as Puzzle[];
export const DISCOVERED_CHECK_PUZZLES: readonly Puzzle[] = discoveredChecksJson as unknown as Puzzle[];
export const DEFLECTION_DECOY_PUZZLES: readonly Puzzle[] = deflectionDecoyJson as unknown as Puzzle[];
export const GREEK_GIFT_PUZZLES: readonly Puzzle[] = greekGiftJson as unknown as Puzzle[];
export const WINDMILL_PUZZLES: readonly Puzzle[] = windmillJson as unknown as Puzzle[];
export const BACK_RANK_PUZZLES: readonly Puzzle[] = backRankJson as unknown as Puzzle[];
export const ANASTASIA_HOOK_PUZZLES: readonly Puzzle[] = anastasiaHookJson as unknown as Puzzle[];
export const SMOTHERED_PUZZLES: readonly Puzzle[] = smotheredJson as unknown as Puzzle[];
export const ENDGAME_CONVERSION_PUZZLES: readonly Puzzle[] = endgameConversionJson as unknown as Puzzle[];

/**
 * Aggregated catalog of all curated offline CC0 puzzles.
 */
export const ALL_PUZZLES: readonly Puzzle[] = [
  ...FORK_PUZZLES,
  ...PIN_PUZZLES,
  ...SKEWER_PUZZLES,
  ...DISCOVERED_CHECK_PUZZLES,
  ...DEFLECTION_DECOY_PUZZLES,
  ...GREEK_GIFT_PUZZLES,
  ...WINDMILL_PUZZLES,
  ...BACK_RANK_PUZZLES,
  ...ANASTASIA_HOOK_PUZZLES,
  ...SMOTHERED_PUZZLES,
  ...ENDGAME_CONVERSION_PUZZLES,
];

/**
 * Index map by puzzle ID for O(1) lookups.
 */
export const PUZZLES_BY_ID: ReadonlyMap<string, Puzzle> = new Map(
  ALL_PUZZLES.map((p) => [p.id, p])
);

/**
 * Index map grouping puzzles by primary theme.
 */
const _puzzlesByTheme = new Map<PuzzleTheme, Puzzle[]>();
for (const p of ALL_PUZZLES) {
  for (const theme of p.themes) {
    const list = _puzzlesByTheme.get(theme) ?? [];
    list.push(p);
    _puzzlesByTheme.set(theme, list);
  }
}
export const PUZZLES_BY_THEME: ReadonlyMap<PuzzleTheme, readonly Puzzle[]> = _puzzlesByTheme;

/**
 * Index map grouping puzzles by difficulty tier.
 */
const _puzzlesByDiff = new Map<PuzzleDifficultyTier, Puzzle[]>();
for (const p of ALL_PUZZLES) {
  const list = _puzzlesByDiff.get(p.difficulty) ?? [];
  list.push(p);
  _puzzlesByDiff.set(p.difficulty, list);
}
export const PUZZLES_BY_DIFFICULTY: ReadonlyMap<PuzzleDifficultyTier, readonly Puzzle[]> = _puzzlesByDiff;

/**
 * Retrieves a puzzle by its unique identifier.
 */
export function getPuzzleById(id: string): Puzzle | undefined {
  return PUZZLES_BY_ID.get(id);
}

/**
 * Returns all puzzles tagged with a specific theme.
 */
export function getPuzzlesByTheme(theme: PuzzleTheme): readonly Puzzle[] {
  return PUZZLES_BY_THEME.get(theme) ?? [];
}

/**
 * Returns all puzzles belonging to a difficulty tier.
 */
export function getPuzzlesByDifficulty(difficulty: PuzzleDifficultyTier): readonly Puzzle[] {
  return PUZZLES_BY_DIFFICULTY.get(difficulty) ?? [];
}

/**
 * Returns puzzles within a specified rating bracket.
 */
export function getPuzzlesByRatingBand(minRating: number, maxRating: number): readonly Puzzle[] {
  return ALL_PUZZLES.filter((p) => p.rating >= minRating && p.rating <= maxRating);
}

/**
 * Finds the closest puzzle to target rating, optionally excluding already played IDs.
 */
export function getClosestPuzzleToRating(
  targetRating: number,
  excludeIds: readonly string[] = []
): Puzzle | null {
  const excludedSet = new Set(excludeIds);
  const candidates = ALL_PUZZLES.filter((p) => !excludedSet.has(p.id));

  if (candidates.length === 0) {
    // If all puzzles excluded, fallback to any closest candidate
    if (ALL_PUZZLES.length === 0) return null;
    return [...ALL_PUZZLES].sort(
      (a, b) => Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating)
    )[0] ?? null;
  }

  return candidates.sort(
    (a, b) => Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating)
  )[0] ?? null;
}

/**
 * Selects a random puzzle, optionally filtered by theme or rating band.
 */
export function getRandomPuzzle(theme?: PuzzleTheme, targetRating?: number): Puzzle {
  let pool = theme ? getPuzzlesByTheme(theme) : ALL_PUZZLES;
  if (pool.length === 0) {
    pool = ALL_PUZZLES;
  }

  if (typeof targetRating === 'number') {
    const sorted = [...pool].sort(
      (a, b) => Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating)
    );
    // Take from the top 5 closest
    const slice = sorted.slice(0, Math.min(5, sorted.length));
    return slice[Math.floor(Math.random() * slice.length)] ?? ALL_PUZZLES[0];
  }

  return pool[Math.floor(Math.random() * pool.length)] ?? ALL_PUZZLES[0];
}

/**
 * Generates metadata summary for the offline puzzle library.
 */
export function getPuzzlePackMetadata(): PuzzlePackMetadata {
  const themeDistribution: Record<string, number> = {};
  for (const p of ALL_PUZZLES) {
    themeDistribution[p.primaryTheme] = (themeDistribution[p.primaryTheme] ?? 0) + 1;
  }

  return {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    totalPuzzles: ALL_PUZZLES.length,
    themeDistribution,
    ratingDistribution: {
      novice: getPuzzlesByDifficulty('novice').length,
      easy: getPuzzlesByDifficulty('easy').length,
      medium: getPuzzlesByDifficulty('medium').length,
      hard: getPuzzlesByDifficulty('hard').length,
      expert: getPuzzlesByDifficulty('expert').length,
    },
  };
}
