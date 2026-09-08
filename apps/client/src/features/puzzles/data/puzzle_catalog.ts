import type {
  Puzzle,
  PuzzleTheme,
  PuzzleDifficultyTier,
  PuzzlePackMetadata,
} from "@fun-chess/shared";
import { parseUciMove, formatPlayerMoveToUci } from "@fun-chess/shared";
export { parseUciMove, formatPlayerMoveToUci };

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
 * Index map by puzzle ID for O(1) lookups (internal per MIN-014).
 */
const PUZZLES_BY_ID: ReadonlyMap<string, Puzzle> = new Map(
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

  // Tactical motif cross-mappings
  decoy: ["deflection"],
  deflection: ["decoy"],
  discovered_attack: ["discovered_check", "windmill"],
};

/**
 * Static dictionary lookups for thematic classification (MIN-008).
 * Eliminates fragile numeric ID regex slicing.
 */
const ANASTASIA_MATE_PUZZLE_IDS: ReadonlySet<string> = new Set([
  "puz_ah_001", "puz_ah_002", "puz_ah_003", "puz_ah_004", "puz_ah_005",
  "puz_ah_006", "puz_ah_007", "puz_ah_008", "puz_ah_009", "puz_ah_010",
  "puz_ah_011", "puz_ah_012", "puz_ah_013", "puz_ah_014", "puz_ah_015",
]);

const HOOK_MATE_PUZZLE_IDS: ReadonlySet<string> = new Set([
  "puz_ah_016", "puz_ah_017", "puz_ah_018", "puz_ah_019", "puz_ah_020",
  "puz_ah_021", "puz_ah_022", "puz_ah_023", "puz_ah_024", "puz_ah_025",
  "puz_ah_026", "puz_ah_027", "puz_ah_028", "puz_ah_029", "puz_ah_030",
]);

const PAWN_ENDGAME_PUZZLE_IDS: ReadonlySet<string> = new Set([
  "puz_eg_001", "puz_eg_002", "puz_eg_003", "puz_eg_004", "puz_eg_005",
  "puz_eg_006", "puz_eg_007", "puz_eg_008", "puz_eg_009", "puz_eg_010",
  "puz_eg_011", "puz_eg_012", "puz_eg_013", "puz_eg_014", "puz_eg_015",
  "puz_eg_016", "puz_eg_017", "puz_eg_018", "puz_eg_019", "puz_eg_020",
  "puz_eg_021", "puz_eg_022", "puz_eg_023", "puz_eg_024",
]);

const ROOK_ENDGAME_PUZZLE_IDS: ReadonlySet<string> = new Set([
  "puz_eg_001", "puz_eg_002", "puz_eg_003", "puz_eg_004", "puz_eg_005",
  "puz_eg_006", "puz_eg_007", "puz_eg_008", "puz_eg_009", "puz_eg_010",
  "puz_eg_025", "puz_eg_026", "puz_eg_027", "puz_eg_028", "puz_eg_029", "puz_eg_030",
]);

interface PuzzleRuleContext {
  puzzle: Puzzle;
  id: string;
  title: string;
  primaryThemeStr: string;
  currentThemes: Set<PuzzleTheme>;
}

interface PuzzleThemeMappingRule {
  name: string;
  matches: (ctx: PuzzleRuleContext) => boolean;
  apply: (ctx: PuzzleRuleContext, themes: Set<PuzzleTheme>) => void;
}

/**
 * Declarative theme mapping rules table (MAJ-037).
 * Replaces high-complexity if-cascade with predictable, testable pattern definitions.
 */
const PUZZLE_THEME_RULES: readonly PuzzleThemeMappingRule[] = [
  // 1. Back rank mate mapping (back_rank <-> back_rank_mate)
  {
    name: 'back_rank_mate',
    matches: (ctx) =>
      ctx.primaryThemeStr === 'back_rank' ||
      ctx.primaryThemeStr === 'back_rank_mate' ||
      ctx.currentThemes.has('back_rank' as PuzzleTheme) ||
      ctx.currentThemes.has('back_rank_mate') ||
      ctx.id.startsWith('puz_br') ||
      ctx.id.startsWith('puz_back_rank'),
    apply: (_ctx, themes) => {
      themes.add('back_rank_mate');
    },
  },

  // 2. Smothered mate mapping (smothered <-> smothered_mate)
  {
    name: 'smothered_mate',
    matches: (ctx) =>
      ctx.primaryThemeStr === 'smothered' ||
      ctx.primaryThemeStr === 'smothered_mate' ||
      ctx.currentThemes.has('smothered') ||
      ctx.currentThemes.has('smothered_mate') ||
      ctx.id.startsWith('puz_sm'),
    apply: (_ctx, themes) => {
      themes.add('smothered');
      themes.add('smothered_mate');
    },
  },

  // 3. Anastasia & Hook mate mapping (anastasia_mate, hook_mate <-> anastasia_hook)
  {
    name: 'anastasia_hook',
    matches: (ctx) =>
      ctx.primaryThemeStr === 'anastasia_hook' ||
      ctx.primaryThemeStr === 'anastasia_mate' ||
      ctx.primaryThemeStr === 'hook_mate' ||
      ctx.currentThemes.has('anastasia_hook') ||
      ctx.currentThemes.has('anastasia_mate') ||
      ctx.currentThemes.has('hook_mate') ||
      ctx.id.startsWith('puz_ah') ||
      ctx.id.startsWith('puz_anastasia'),
    apply: (ctx, themes) => {
      themes.add('anastasia_hook');
      if (
        ctx.title.includes('anastasia') ||
        ctx.currentThemes.has('anastasia_mate') ||
        ANASTASIA_MATE_PUZZLE_IDS.has(ctx.id)
      ) {
        themes.add('anastasia_mate');
      }
      if (
        ctx.title.includes('hook') ||
        ctx.currentThemes.has('hook_mate') ||
        HOOK_MATE_PUZZLE_IDS.has(ctx.id)
      ) {
        themes.add('hook_mate');
      }
    },
  },

  // 4. Endgame conversion mapping (pawn_endgame, rook_endgame <-> endgame_conversion)
  {
    name: 'endgame_conversion',
    matches: (ctx) =>
      ctx.primaryThemeStr === 'endgame_conversion' ||
      ctx.primaryThemeStr === 'pawn_endgame' ||
      ctx.primaryThemeStr === 'rook_endgame' ||
      ctx.primaryThemeStr === 'lucena_position' ||
      ctx.primaryThemeStr === 'pawn_breakthrough' ||
      ctx.primaryThemeStr === 'king_opposition' ||
      ctx.currentThemes.has('endgame_conversion') ||
      ctx.currentThemes.has('pawn_endgame') ||
      ctx.currentThemes.has('rook_endgame') ||
      ctx.id.startsWith('puz_eg') ||
      ctx.id.startsWith('puz_endgame'),
    apply: (ctx, themes) => {
      themes.add('endgame_conversion');
      if (
        ctx.title.includes('pawn') ||
        ctx.primaryThemeStr === 'pawn_endgame' ||
        ctx.primaryThemeStr === 'pawn_breakthrough' ||
        ctx.primaryThemeStr === 'king_opposition' ||
        PAWN_ENDGAME_PUZZLE_IDS.has(ctx.id)
      ) {
        themes.add('pawn_endgame');
        themes.add('promotion');
      }
      if (
        ctx.title.includes('queen') ||
        ctx.title.includes('rook') ||
        ctx.title.includes('endgame') ||
        ctx.primaryThemeStr === 'rook_endgame' ||
        ctx.primaryThemeStr === 'lucena_position' ||
        ROOK_ENDGAME_PUZZLE_IDS.has(ctx.id)
      ) {
        themes.add('rook_endgame');
        themes.add('queen_endgame');
      }
    },
  },

  // 5. Deflection & Decoy mapping
  {
    name: 'deflection_decoy',
    matches: (ctx) =>
      ctx.primaryThemeStr === 'deflection' ||
      ctx.primaryThemeStr === 'decoy' ||
      ctx.primaryThemeStr === 'deflection_decoy' ||
      ctx.currentThemes.has('deflection') ||
      ctx.currentThemes.has('decoy') ||
      ctx.currentThemes.has('deflection_decoy' as PuzzleTheme) ||
      ctx.id.startsWith('puz_defl') ||
      ctx.id.startsWith('puz_deflection'),
    apply: (_ctx, themes) => {
      themes.add('deflection');
      themes.add('decoy');
    },
  },

  // 6. Discovered Check & Discovered Attack mapping
  {
    name: 'discovered_check_attack',
    matches: (ctx) =>
      ctx.primaryThemeStr === 'discovered_check' ||
      ctx.primaryThemeStr === 'discovered_attack' ||
      ctx.currentThemes.has('discovered_check') ||
      ctx.currentThemes.has('discovered_attack') ||
      ctx.id.startsWith('puz_disc') ||
      ctx.id.startsWith('puz_discovered'),
    apply: (_ctx, themes) => {
      themes.add('discovered_check');
      themes.add('discovered_attack');
    },
  },

  // 7. Mate depth tagging
  {
    name: 'mate_depth',
    matches: (ctx) => ctx.puzzle.tacticalReward === 'checkmate',
    apply: (ctx, themes) => {
      const plies = ctx.puzzle.solutionPlies ?? ctx.puzzle.moves.length;
      if (plies === 1 || ctx.puzzle.moves.length === 1) {
        themes.add('mate_in_1');
      } else if (plies === 3 || ctx.puzzle.moves.length === 3) {
        themes.add('mate_in_2');
      } else if (plies === 5 || ctx.puzzle.moves.length === 5) {
        themes.add('mate_in_3');
      }
    },
  },

  // 8. Hanging piece mapping
  {
    name: 'hanging_piece',
    matches: (ctx) => {
      const p = ctx.puzzle;
      const text = `${p.title} ${p.subtitle ?? ''} ${p.tacticalGoal} ${p.learningSummary} ${p.keyTakeaway}`.toLowerCase();
      return (
        ctx.primaryThemeStr === 'hanging_piece' ||
        ctx.currentThemes.has('hanging_piece') ||
        text.includes('undefended') ||
        text.includes('hanging') ||
        text.includes('unprotected') ||
        text.includes('free piece') ||
        text.includes('free pawn') ||
        text.includes('snatch') ||
        ctx.id === 'puz_fork_007' ||
        ctx.id === 'puz_fork_009' ||
        ctx.id === 'puz_fork_013' ||
        ctx.id === 'puz_skewer_001' ||
        ctx.id === 'puz_skewer_002' ||
        ctx.id === 'puz_pin_014' ||
        ctx.id === 'puz_pin_026' ||
        ctx.id === 'puz_disc_008' ||
        ctx.id === 'puz_disc_026'
      );
    },
    apply: (_ctx, themes) => {
      themes.add('hanging_piece');
    },
  },

  // 9. Trapped piece mapping
  {
    name: 'trapped_piece',
    matches: (ctx) => {
      const p = ctx.puzzle;
      const text = `${p.title} ${p.subtitle ?? ''} ${p.tacticalGoal} ${p.learningSummary} ${p.keyTakeaway}`.toLowerCase();
      return (
        ctx.primaryThemeStr === 'trapped_piece' ||
        ctx.currentThemes.has('trapped_piece') ||
        text.includes('trapped') ||
        text.includes('trap') ||
        text.includes('boxes in') ||
        text.includes('boxed in') ||
        text.includes('no escape') ||
        text.includes('cornered') ||
        ctx.id === 'puz_skewer_027' ||
        ctx.id === 'puz_skewer_028' ||
        ctx.id === 'puz_skewer_029' ||
        ctx.id === 'puz_skewer_030' ||
        ctx.id.startsWith('puz_sm_')
      );
    },
    apply: (_ctx, themes) => {
      themes.add('trapped_piece');
    },
  },

  // 10. Clearance mapping
  {
    name: 'clearance',
    matches: (ctx) => {
      const p = ctx.puzzle;
      const text = `${p.title} ${p.subtitle ?? ''} ${p.tacticalGoal} ${p.learningSummary} ${p.keyTakeaway}`.toLowerCase();
      return (
        ctx.primaryThemeStr === 'clearance' ||
        ctx.currentThemes.has('clearance') ||
        text.includes('clearance') ||
        text.includes('clear the') ||
        text.includes('clears the') ||
        text.includes('clearing') ||
        text.includes('vacate') ||
        text.includes('open the file') ||
        text.includes('open the h-file') ||
        text.includes('opens the h-file') ||
        ANASTASIA_MATE_PUZZLE_IDS.has(ctx.id) ||
        (ctx.id.startsWith('puz_gg') && (text.includes('sacrifice') || text.includes('assault') || text.includes('open'))) ||
        (ctx.id.startsWith('puz_br') && (p.solutionPlies ?? p.moves.length) >= 3)
      );
    },
    apply: (_ctx, themes) => {
      themes.add('clearance');
    },
  },

  // 11. Battery mapping
  {
    name: 'battery',
    matches: (ctx) => {
      const p = ctx.puzzle;
      const text = `${p.title} ${p.subtitle ?? ''} ${p.tacticalGoal} ${p.learningSummary} ${p.keyTakeaway}`.toLowerCase();
      return (
        ctx.primaryThemeStr === 'battery' ||
        ctx.currentThemes.has('battery') ||
        text.includes('battery') ||
        text.includes('batteries') ||
        text.includes('doubled') ||
        ctx.id.startsWith('puz_wm') ||
        (ctx.id.startsWith('puz_br') && (text.includes('overpower') || text.includes('crush') || (p.solutionPlies ?? p.moves.length) >= 3)) ||
        ctx.id === 'puz_sm_007' ||
        ctx.id === 'puz_sm_018'
      );
    },
    apply: (_ctx, themes) => {
      themes.add('battery');
    },
  },

  // 12. Scholar's mate mapping
  {
    name: 'scholars_mate',
    matches: (ctx) => {
      const p = ctx.puzzle;
      const text = `${p.title} ${p.subtitle ?? ''} ${p.tacticalGoal} ${p.learningSummary} ${p.keyTakeaway}`.toLowerCase();
      const targetsF7orF2 = p.moves.some((m) => m.endsWith('f7') || m.endsWith('f2')) || text.includes('f7') || text.includes('f2');
      const involvesQueenOrBishop = text.includes('queen') || text.includes('bishop') || text.includes('bxf7') || text.includes('qxf7');
      return (
        ctx.primaryThemeStr === 'scholars_mate' ||
        ctx.currentThemes.has('scholars_mate') ||
        text.includes('scholar') ||
        (targetsF7orF2 && involvesQueenOrBishop && (
          ctx.id.startsWith('puz_defl_001') ||
          ctx.id.startsWith('puz_defl_011') ||
          ctx.id.startsWith('puz_disc_001') ||
          ctx.id.startsWith('puz_disc_011') ||
          text.includes('bishop strike on f7') ||
          text.includes('bishop decoy on f7') ||
          text.includes('king deflection on f7') ||
          (p.tacticalReward === 'checkmate' && targetsF7orF2)
        ))
      );
    },
    apply: (_ctx, themes) => {
      themes.add('scholars_mate');
    },
  },

  // 13. Fried Liver mapping
  {
    name: 'fried_liver',
    matches: (ctx) => {
      const p = ctx.puzzle;
      const text = `${p.title} ${p.subtitle ?? ''} ${p.tacticalGoal} ${p.learningSummary} ${p.keyTakeaway}`.toLowerCase();
      const targetsF7orF2 = p.moves.some((m) => m.endsWith('f7') || m.endsWith('f2')) || text.includes('f7') || text.includes('f2');
      const involvesKnight = text.includes('knight') || text.includes('nxf7') || text.includes('nc7');
      return (
        ctx.primaryThemeStr === 'fried_liver' ||
        ctx.currentThemes.has('fried_liver') ||
        text.includes('fried liver') ||
        (targetsF7orF2 && involvesKnight && (
          ctx.id === 'puz_fork_001' ||
          ctx.id === 'puz_fork_002' ||
          ctx.id === 'puz_fork_003' ||
          ctx.id === 'puz_fork_017' ||
          ctx.id === 'puz_fork_030' ||
          (text.includes('f7') && text.includes('knight'))
        ))
      );
    },
    apply: (_ctx, themes) => {
      themes.add('fried_liver');
    },
  },

  // 14. Légal's Trap mapping
  {
    name: 'legals_trap',
    matches: (ctx) => {
      const p = ctx.puzzle;
      const text = `${p.title} ${p.subtitle ?? ''} ${p.tacticalGoal} ${p.learningSummary} ${p.keyTakeaway}`.toLowerCase();
      return (
        ctx.primaryThemeStr === 'legals_trap' ||
        ctx.currentThemes.has('legals_trap') ||
        text.includes('légal') ||
        text.includes('legals') ||
        text.includes("legal's") ||
        (text.includes('nxe5') && text.includes('pinned')) ||
        ctx.id === 'puz_disc_008' ||
        ctx.id === 'puz_disc_026' ||
        ctx.id === 'puz_pin_026' ||
        (text.includes('bxf7+') && text.includes('winning the knight')) ||
        ctx.id === 'puz_defl_001' ||
        ctx.id === 'puz_defl_011' ||
        ctx.id === 'puz_disc_001' ||
        ctx.id === 'puz_disc_011'
      );
    },
    apply: (_ctx, themes) => {
      themes.add('legals_trap');
    },
  },
];

/**
 * Extracts and enriches tactical themes for a puzzle to ensure bidirectional mapping.
 * Uses declarative rule definitions (MAJ-037).
 */
export function extractPuzzleThemes(p: Puzzle): Set<PuzzleTheme> {
  const themes = new Set<PuzzleTheme>(p.themes);
  if (p.primaryTheme) {
    themes.add(p.primaryTheme);
  }

  const ctx: PuzzleRuleContext = {
    puzzle: p,
    id: p.id,
    title: p.title.toLowerCase(),
    primaryThemeStr: (p.primaryTheme as string) ?? '',
    currentThemes: themes,
  };

  for (const rule of PUZZLE_THEME_RULES) {
    if (rule.matches(ctx)) {
      rule.apply(ctx, themes);
    }
  }

  return themes;
}

/**
 * Index map grouping puzzles by primary and secondary themes (internal).
 */
const _puzzlesByTheme = new Map<PuzzleTheme, Puzzle[]>();

// 1. Index enriched themes and calibrate difficulty for all puzzles
for (const p of ALL_PUZZLES) {
  // Calibrate difficulty tag according to canonical rating band (SC-5 / MIN-014)
  let calibratedDifficulty: PuzzleDifficultyTier;
  if (p.rating < 900) {
    calibratedDifficulty = 'novice';
  } else if (p.rating < 1200) {
    calibratedDifficulty = 'easy';
  } else if (p.rating < 1500) {
    calibratedDifficulty = 'medium';
  } else if (p.rating < 1800) {
    calibratedDifficulty = 'hard';
  } else {
    calibratedDifficulty = 'expert';
  }
  (p as { difficulty: PuzzleDifficultyTier }).difficulty = calibratedDifficulty;

  const enrichedThemes = extractPuzzleThemes(p);
  const currentThemes = new Set(p.themes);
  for (const t of enrichedThemes) {
    currentThemes.add(t);
  }
  (p as { themes: readonly PuzzleTheme[] }).themes = Array.from(currentThemes);

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

const PUZZLES_BY_THEME: ReadonlyMap<PuzzleTheme, readonly Puzzle[]> =
  _puzzlesByTheme;

/**
 * Index map grouping puzzles by difficulty tier (internal).
 */
const _puzzlesByDiff = new Map<PuzzleDifficultyTier, Puzzle[]>();
for (const p of ALL_PUZZLES) {
  const list = _puzzlesByDiff.get(p.difficulty) ?? [];
  list.push(p);
  _puzzlesByDiff.set(p.difficulty, list);
}

const PUZZLES_BY_DIFFICULTY: ReadonlyMap<
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

  const defaultPuzzle = ALL_PUZZLES[0] as Puzzle;
  if (typeof targetRating === "number") {
    const sorted = [...pool].sort(
      (a, b) =>
        Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating),
    );
    // Take from the top 5 closest
    const slice = sorted.slice(0, Math.min(5, sorted.length));
    return slice[Math.floor(Math.random() * slice.length)] ?? defaultPuzzle;
  }

  return pool[Math.floor(Math.random() * pool.length)] ?? defaultPuzzle;
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
