import type {
  Puzzle,
  PuzzleTheme,
  PuzzleDifficultyTier,
  PuzzlePackMetadata,
} from "@fun-chess/shared";

// Import raw JSON puzzle packs
import forksJson from "./forks.json";
import pinsJson from "./pins.json";
import skewersJson from "./skewers.json";
import discoveredChecksJson from "./discovered_checks.json";
import deflectionDecoyJson from "./deflection_decoy.json";
import greekGiftJson from "./greek_gift.json";
import windmillJson from "./windmill.json";
import backRankJson from "./back_rank.json";
import anastasiaHookJson from "./anastasia_hook.json";
import smotheredJson from "./smothered.json";
import endgameConversionJson from "./endgame_conversion.json";

export const FORK_PUZZLES: readonly Puzzle[] = forksJson as unknown as Puzzle[];
export const PIN_PUZZLES: readonly Puzzle[] = pinsJson as unknown as Puzzle[];
export const SKEWER_PUZZLES: readonly Puzzle[] =
  skewersJson as unknown as Puzzle[];
export const DISCOVERED_CHECK_PUZZLES: readonly Puzzle[] =
  discoveredChecksJson as unknown as Puzzle[];
export const DEFLECTION_DECOY_PUZZLES: readonly Puzzle[] =
  deflectionDecoyJson as unknown as Puzzle[];
export const GREEK_GIFT_PUZZLES: readonly Puzzle[] =
  greekGiftJson as unknown as Puzzle[];
export const WINDMILL_PUZZLES: readonly Puzzle[] =
  windmillJson as unknown as Puzzle[];
export const BACK_RANK_PUZZLES: readonly Puzzle[] =
  backRankJson as unknown as Puzzle[];
export const ANASTASIA_HOOK_PUZZLES: readonly Puzzle[] =
  anastasiaHookJson as unknown as Puzzle[];
export const SMOTHERED_PUZZLES: readonly Puzzle[] =
  smotheredJson as unknown as Puzzle[];
export const ENDGAME_CONVERSION_PUZZLES: readonly Puzzle[] =
  endgameConversionJson as unknown as Puzzle[];

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
  ALL_PUZZLES.map((p) => [p.id, p]),
);

/**
 * Canonical theme alias and fallback map ensuring all tactical themes
 * and pack tags resolve reliably to playable curated puzzles.
 */
export const THEME_ALIASES: Readonly<
  Partial<Record<PuzzleTheme, readonly PuzzleTheme[]>>
> = {
  // Checkmate aliases
  smothered_mate: ["smothered"],
  smothered: ["smothered_mate"],
  anastasia_mate: ["anastasia_hook"],
  hook_mate: ["anastasia_hook"],
  anastasia_hook: ["anastasia_mate", "hook_mate"],
  back_rank_mate: ["back_rank_mate"],

  // Endgame aliases
  pawn_endgame: ["endgame_conversion", "promotion"],
  rook_endgame: ["endgame_conversion", "queen_endgame"],
  endgame_conversion: ["pawn_endgame", "rook_endgame", "promotion"],

  // Tactical motif cross-mappings & fallbacks
  decoy: ["deflection"],
  deflection: ["decoy"],
  discovered_attack: ["discovered_check", "windmill"],
  hanging_piece: ["fork", "pin", "skewer"],
  trapped_piece: ["smothered", "smothered_mate", "skewer", "pin"],
  clearance: ["greek_gift", "deflection", "anastasia_hook"],
  battery: ["back_rank_mate", "windmill", "greek_gift"],
  scholars_mate: ["mate_in_1", "back_rank_mate", "greek_gift"],
  fried_liver: ["fork", "greek_gift"],
  legals_trap: ["deflection", "greek_gift", "smothered_mate"],
};

/**
 * Extracts and enriches tactical themes for a puzzle to ensure bidirectional mapping.
 */
function extractPuzzleThemes(p: Puzzle): Set<PuzzleTheme> {
  const themes = new Set<PuzzleTheme>(p.themes);
  if (p.primaryTheme) {
    themes.add(p.primaryTheme);
  }

  const id = p.id;
  const title = p.title.toLowerCase();
  const primaryThemeStr = p.primaryTheme as string;
  const themesRaw = themes as Set<string>;

  // Back rank mate mapping (back_rank <-> back_rank_mate)
  if (
    primaryThemeStr === "back_rank" ||
    p.primaryTheme === "back_rank_mate" ||
    themesRaw.has("back_rank") ||
    themes.has("back_rank_mate") ||
    id.startsWith("puz_br") ||
    id.startsWith("puz_back_rank")
  ) {
    themes.add("back_rank_mate");
  }

  // Smothered mate mapping (smothered <-> smothered_mate)
  if (
    p.primaryTheme === "smothered" ||
    p.primaryTheme === "smothered_mate" ||
    themes.has("smothered") ||
    themes.has("smothered_mate") ||
    id.startsWith("puz_sm")
  ) {
    themes.add("smothered");
    themes.add("smothered_mate");
  }

  // Anastasia & Hook mate mapping (anastasia_mate, hook_mate <-> anastasia_hook)
  if (
    p.primaryTheme === "anastasia_hook" ||
    p.primaryTheme === "anastasia_mate" ||
    p.primaryTheme === "hook_mate" ||
    themes.has("anastasia_hook") ||
    themes.has("anastasia_mate") ||
    themes.has("hook_mate") ||
    id.startsWith("puz_ah") ||
    id.startsWith("puz_anastasia")
  ) {
    themes.add("anastasia_hook");
    if (
      title.includes("anastasia") ||
      themes.has("anastasia_mate") ||
      parseInt(id.replace(/\D/g, ""), 10) <= 15
    ) {
      themes.add("anastasia_mate");
    }
    if (
      title.includes("hook") ||
      themes.has("hook_mate") ||
      parseInt(id.replace(/\D/g, ""), 10) > 15
    ) {
      themes.add("hook_mate");
    }
  }

  // Endgame conversion mapping (pawn_endgame, rook_endgame <-> endgame_conversion)
  if (
    p.primaryTheme === "endgame_conversion" ||
    p.primaryTheme === "pawn_endgame" ||
    p.primaryTheme === "rook_endgame" ||
    p.primaryTheme === "lucena_position" ||
    primaryThemeStr === "pawn_breakthrough" ||
    primaryThemeStr === "king_opposition" ||
    themes.has("endgame_conversion") ||
    themes.has("pawn_endgame") ||
    themes.has("rook_endgame") ||
    id.startsWith("puz_eg") ||
    id.startsWith("puz_endgame")
  ) {
    themes.add("endgame_conversion");
    if (
      title.includes("pawn") ||
      p.primaryTheme === "pawn_endgame" ||
      primaryThemeStr === "pawn_breakthrough" ||
      primaryThemeStr === "king_opposition" ||
      parseInt(id.replace(/\D/g, ""), 10) <= 24
    ) {
      themes.add("pawn_endgame");
      themes.add("promotion");
    }
    if (
      title.includes("queen") ||
      title.includes("rook") ||
      title.includes("endgame") ||
      p.primaryTheme === "rook_endgame" ||
      p.primaryTheme === "lucena_position" ||
      parseInt(id.replace(/\D/g, ""), 10) > 24 ||
      parseInt(id.replace(/\D/g, ""), 10) <= 10
    ) {
      themes.add("rook_endgame");
      themes.add("queen_endgame");
    }
  }

  // Deflection & Decoy mapping
  if (
    p.primaryTheme === "deflection" ||
    p.primaryTheme === "decoy" ||
    primaryThemeStr === "deflection_decoy" ||
    themes.has("deflection") ||
    themes.has("decoy") ||
    themesRaw.has("deflection_decoy") ||
    id.startsWith("puz_defl") ||
    id.startsWith("puz_deflection")
  ) {
    themes.add("deflection");
    themes.add("decoy");
  }

  // Discovered Check & Discovered Attack mapping
  if (
    p.primaryTheme === "discovered_check" ||
    p.primaryTheme === "discovered_attack" ||
    themes.has("discovered_check") ||
    themes.has("discovered_attack") ||
    id.startsWith("puz_disc") ||
    id.startsWith("puz_discovered")
  ) {
    themes.add("discovered_check");
    themes.add("discovered_attack");
  }

  // Mate depth tagging
  if (p.tacticalReward === "checkmate") {
    if (p.solutionPlies === 1 || p.moves.length === 1) {
      themes.add("mate_in_1");
    } else if (p.solutionPlies === 3 || p.moves.length === 3) {
      themes.add("mate_in_2");
    } else if (p.solutionPlies === 5 || p.moves.length === 5) {
      themes.add("mate_in_3");
    }
  }

  return themes;
}

/**
 * Index map grouping puzzles by primary and secondary themes.
 */
const _puzzlesByTheme = new Map<PuzzleTheme, Puzzle[]>();

// 1. Index enriched themes for all puzzles
for (const p of ALL_PUZZLES) {
  const enrichedThemes = extractPuzzleThemes(p);
  for (const theme of enrichedThemes) {
    const list = _puzzlesByTheme.get(theme) ?? [];
    list.push(p);
    _puzzlesByTheme.set(theme, list);
  }
}

// 2. Ensure all themes in THEME_ALIASES have populated lists if direct indexing was empty
for (const [theme, aliases] of Object.entries(THEME_ALIASES)) {
  const t = theme as PuzzleTheme;
  const currentList = _puzzlesByTheme.get(t);
  if (!currentList || currentList.length === 0) {
    const combined: Puzzle[] = [];
    const seen = new Set<string>();
    for (const alt of aliases) {
      const altList = _puzzlesByTheme.get(alt) ?? [];
      for (const p of altList) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          combined.push(p);
        }
      }
    }
    if (combined.length > 0) {
      _puzzlesByTheme.set(t, combined);
    }
  }
}

export const PUZZLES_BY_THEME: ReadonlyMap<PuzzleTheme, readonly Puzzle[]> =
  _puzzlesByTheme;

/**
 * Index map grouping puzzles by difficulty tier.
 */
const _puzzlesByDiff = new Map<PuzzleDifficultyTier, Puzzle[]>();
for (const p of ALL_PUZZLES) {
  const list = _puzzlesByDiff.get(p.difficulty) ?? [];
  list.push(p);
  _puzzlesByDiff.set(p.difficulty, list);
}
export const PUZZLES_BY_DIFFICULTY: ReadonlyMap<
  PuzzleDifficultyTier,
  readonly Puzzle[]
> = _puzzlesByDiff;

/**
 * Retrieves a puzzle by its unique identifier.
 */
export function getPuzzleById(id: string): Puzzle | undefined {
  return PUZZLES_BY_ID.get(id);
}

/**
 * Returns all puzzles tagged with a specific theme, resolving aliases and fallbacks if necessary.
 */
export function getPuzzlesByTheme(theme: PuzzleTheme): readonly Puzzle[] {
  const direct = PUZZLES_BY_THEME.get(theme);
  if (direct && direct.length > 0) {
    return direct;
  }

  // Fallback to aliased themes
  const aliases = THEME_ALIASES[theme];
  if (aliases && aliases.length > 0) {
    const combined: Puzzle[] = [];
    const seen = new Set<string>();
    for (const alt of aliases) {
      const list = PUZZLES_BY_THEME.get(alt) ?? [];
      for (const p of list) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          combined.push(p);
        }
      }
    }
    if (combined.length > 0) {
      return combined;
    }
  }

  return [];
}

/**
 * Returns all puzzles belonging to a difficulty tier.
 */
export function getPuzzlesByDifficulty(
  difficulty: PuzzleDifficultyTier,
): readonly Puzzle[] {
  return PUZZLES_BY_DIFFICULTY.get(difficulty) ?? [];
}

/**
 * Returns puzzles within a specified rating bracket.
 */
export function getPuzzlesByRatingBand(
  minRating: number,
  maxRating: number,
): readonly Puzzle[] {
  return ALL_PUZZLES.filter(
    (p) => p.rating >= minRating && p.rating <= maxRating,
  );
}

/**
 * Finds the closest puzzle to target rating, optionally excluding already played IDs.
 */
export function getClosestPuzzleToRating(
  targetRating: number,
  excludeIds: readonly string[] = [],
): Puzzle | null {
  const excludedSet = new Set(excludeIds);
  const candidates = ALL_PUZZLES.filter((p) => !excludedSet.has(p.id));

  if (candidates.length === 0) {
    // If all puzzles excluded, fallback to any closest candidate
    if (ALL_PUZZLES.length === 0) return null;
    return (
      [...ALL_PUZZLES].sort(
        (a, b) =>
          Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating),
      )[0] ?? null
    );
  }

  return (
    candidates.sort(
      (a, b) =>
        Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating),
    )[0] ?? null
  );
}

/**
 * Selects a random puzzle, optionally filtered by theme or rating band.
 */
export function getRandomPuzzle(
  theme?: PuzzleTheme,
  targetRating?: number,
): Puzzle {
  let pool = theme ? getPuzzlesByTheme(theme) : ALL_PUZZLES;
  if (pool.length === 0) {
    pool = ALL_PUZZLES;
  }

  if (typeof targetRating === "number") {
    const sorted = [...pool].sort(
      (a, b) =>
        Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating),
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
    themeDistribution[p.primaryTheme] =
      (themeDistribution[p.primaryTheme] ?? 0) + 1;
  }

  // Also include canonical mapped counts for standard themes
  themeDistribution["smothered_mate"] =
    getPuzzlesByTheme("smothered_mate").length;
  themeDistribution["anastasia_mate"] =
    getPuzzlesByTheme("anastasia_mate").length;
  themeDistribution["hook_mate"] = getPuzzlesByTheme("hook_mate").length;
  themeDistribution["pawn_endgame"] = getPuzzlesByTheme("pawn_endgame").length;
  themeDistribution["rook_endgame"] = getPuzzlesByTheme("rook_endgame").length;
  themeDistribution["decoy"] = getPuzzlesByTheme("decoy").length;
  themeDistribution["discovered_attack"] =
    getPuzzlesByTheme("discovered_attack").length;

  return {
    version: "2.0.0",
    generatedAt: new Date().toISOString(),
    totalPuzzles: ALL_PUZZLES.length,
    themeDistribution,
    ratingDistribution: {
      novice: getPuzzlesByDifficulty("novice").length,
      easy: getPuzzlesByDifficulty("easy").length,
      medium: getPuzzlesByDifficulty("medium").length,
      hard: getPuzzlesByDifficulty("hard").length,
      expert: getPuzzlesByDifficulty("expert").length,
    },
  };
}
