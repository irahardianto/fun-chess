/**
 * Canonical list of all tactical and positional puzzle themes.
 * Grouped into 5 pedagogical domains for structured chess learning.
 * Extracted per MAJ-008 to break circular contract dependencies.
 */
export const PUZZLE_THEMES = [
  // --- Domain 1: Fundamental Tactics ---
  "fork",
  "pin",
  "skewer",
  "discovered_attack",
  "discovered_check",
  "double_check",
  "hanging_piece",
  "trapped_piece",
  // --- Domain 2: Intermediate Tactical Motifs ---
  "captures_checks_threats", // CCT calculation discipline
  "knight_outpost",
  "cross_pin",
  "battery",
  "deflection",
  "decoy",
  "interference",
  "clearance",
  "greek_gift",
  "windmill",
  "zwischenzug", // In-between move
  "desperado",
  "overloaded_piece",
  "x_ray_attack",
  // --- Domain 3: Checkmate Pattern Families ---
  "mate_in_1",
  "mate_in_2",
  "mate_in_3",
  "mate_in_4",
  "mate_in_5",
  "back_rank_mate",
  "scholars_mate",
  "smothered_mate",
  "smothered",
  "anastasia_mate",
  "anastasia_hook",
  "arabian_mate",
  "hook_mate",
  "vukovic_mate",
  "boden_mate",
  "balestra_mate",
  "blackburne_mate",
  "lolli_mate",
  "damiano_mate",
  "kill_box_mate",
  "railroad_mate",
  "blind_swine_mate",
  "dovetail_mate",
  // --- Domain 4: Endgame Conversions ---
  "pawn_endgame",
  "rook_endgame",
  "queen_endgame",
  "minor_piece_endgame",
  "endgame_conversion",
  "promotion",
  "win_queen",
  "lucena_position",
  "philidor_defense",
  "two_bishops_mate",
  // --- Domain 5: Opening Traps & Defenses ---
  "legals_trap",
  "fried_liver",
  "noahs_ark_trap",
  "fools_mate",
] as const;

/**
 * Comprehensive tactical and positional motif themes for curated puzzles.
 * Grouped into 5 pedagogical domains for structured chess learning.
 */
export type PuzzleTheme = (typeof PUZZLE_THEMES)[number];
