import type { ChessScenario, CurriculumSection } from '@fun-chess/shared';

// Fundamentals
import { pawnJourneyScenario } from './fundamentals/pawn_journey';
import { knightJumpsScenario } from './fundamentals/knight_jumps';
import { bishopDiagonalsScenario } from './fundamentals/bishop_diagonals';
import { rookLinesScenario } from './fundamentals/rook_lines';
import { queenPowerScenario } from './fundamentals/queen_power';
import { kingSafetyScenario } from './fundamentals/king_safety';

// Special Moves & Opening Traps
import { castlingSafetyScenario } from './special_moves/castling_safety';
import { enPassantScenario } from './special_moves/en_passant_secret';
import { pawnPromotionScenario } from './special_moves/pawn_promotion';
import { legalsTrapScenario } from './special_moves/legals_trap';
import { friedLiverAttackScenario } from './special_moves/fried_liver_attack';

// Tactical Patterns (Basic)
import { royalForkScenario } from './tactics/royal_fork';
import { absolutePinScenario } from './tactics/absolute_pin';
import { deadlySkewerScenario } from './tactics/deadly_skewer';
import { discoveredCheckScenario } from './tactics/discovered_check';

// Intermediate Tactics (Expanded)
import { cctTriggerScenario } from './tactics/cct_trigger';
import { knightOutpostsScenario } from './tactics/knight_outposts';
import { discoveredDoubleCheckScenario } from './tactics/discovered_double_check';
import { crossPinsBatteriesScenario } from './tactics/cross_pins_batteries';
import { deflectionDecoyScenario } from './tactics/deflection_decoy';
import { clearanceInterferenceScenario } from './tactics/clearance_interference';
import { greekGiftSacrificeScenario } from './tactics/greek_gift_sacrifice';
import { windmillTornadoScenario } from './tactics/windmill_tornado';
import { zwischenzugInBetweenScenario } from './tactics/zwischenzug_in_between';
import { desperadoEscapeScenario } from './tactics/desperado_escape';

// Checkmate Patterns (Basic)
import { scholarsMateAttackScenario } from './checkmates/scholars_mate_attack';
import { scholarsMateDefenseScenario } from './checkmates/scholars_mate_defense';
import { foolsMateScenario } from './checkmates/fools_mate';
import { backRankMateScenario } from './checkmates/back_rank_mate';

// Checkmate Families (Expanded)
import { anastasiaMateScenario } from './checkmates/anastasia_mate';
import { arabianMateScenario } from './checkmates/arabian_mate';
import { hookMateScenario } from './checkmates/hook_mate';
import { vukovicMateScenario } from './checkmates/vukovic_mate';
import { bodensMateScenario } from './checkmates/bodens_mate';
import { balestraBlackburneScenario } from './checkmates/balestra_blackburne';
import { lolliDamianoOperaScenario } from './checkmates/lolli_damiano_opera';
import { killBoxRailroadScenario } from './checkmates/kill_box_railroad';
import { blindSwineSeventhScenario } from './checkmates/blind_swine_seventh';

// Endgame Basics & Conversions
import { kingQueenMateScenario } from './endgame/king_queen_mate';
import { kingRookMateScenario } from './endgame/king_rook_mate';
import { lucenaBridgeScenario } from './endgame/lucena_bridge';
import { philidorDefenseScenario } from './endgame/philidor_defense';
import { twoBishopsMateScenario } from './endgame/two_bishops_mate';

// Re-export all scenarios
export * from './fundamentals/pawn_journey';
export * from './fundamentals/knight_jumps';
export * from './fundamentals/bishop_diagonals';
export * from './fundamentals/rook_lines';
export * from './fundamentals/queen_power';
export * from './fundamentals/king_safety';

export * from './special_moves/castling_safety';
export * from './special_moves/en_passant_secret';
export * from './special_moves/pawn_promotion';
export * from './special_moves/legals_trap';
export * from './special_moves/fried_liver_attack';

export * from './tactics/royal_fork';
export * from './tactics/absolute_pin';
export * from './tactics/deadly_skewer';
export * from './tactics/discovered_check';

export * from './tactics/cct_trigger';
export * from './tactics/knight_outposts';
export * from './tactics/discovered_double_check';
export * from './tactics/cross_pins_batteries';
export * from './tactics/deflection_decoy';
export * from './tactics/clearance_interference';
export * from './tactics/greek_gift_sacrifice';
export * from './tactics/windmill_tornado';
export * from './tactics/zwischenzug_in_between';
export * from './tactics/desperado_escape';

export * from './checkmates/scholars_mate_attack';
export * from './checkmates/scholars_mate_defense';
export * from './checkmates/fools_mate';
export * from './checkmates/back_rank_mate';

export * from './checkmates/anastasia_mate';
export * from './checkmates/arabian_mate';
export * from './checkmates/hook_mate';
export * from './checkmates/vukovic_mate';
export * from './checkmates/bodens_mate';
export * from './checkmates/balestra_blackburne';
export * from './checkmates/lolli_damiano_opera';
export * from './checkmates/kill_box_railroad';
export * from './checkmates/blind_swine_seventh';

export * from './endgame/king_queen_mate';
export * from './endgame/king_rook_mate';
export * from './endgame/lucena_bridge';
export * from './endgame/philidor_defense';
export * from './endgame/two_bishops_mate';

/**
 * All 43 curated scenarios for the Chess Academy.
 */
export const ALL_SCENARIOS: readonly ChessScenario[] = [
  // Fundamentals (6)
  pawnJourneyScenario,
  knightJumpsScenario,
  bishopDiagonalsScenario,
  rookLinesScenario,
  queenPowerScenario,
  kingSafetyScenario,

  // Special Moves (3)
  castlingSafetyScenario,
  enPassantScenario,
  pawnPromotionScenario,

  // Opening Traps (2)
  legalsTrapScenario,
  friedLiverAttackScenario,

  // Basic Tactics (4)
  royalForkScenario,
  absolutePinScenario,
  deadlySkewerScenario,
  discoveredCheckScenario,

  // Intermediate Tactics (10)
  cctTriggerScenario,
  knightOutpostsScenario,
  discoveredDoubleCheckScenario,
  crossPinsBatteriesScenario,
  deflectionDecoyScenario,
  clearanceInterferenceScenario,
  greekGiftSacrificeScenario,
  windmillTornadoScenario,
  zwischenzugInBetweenScenario,
  desperadoEscapeScenario,

  // Basic Checkmates (4)
  scholarsMateAttackScenario,
  scholarsMateDefenseScenario,
  foolsMateScenario,
  backRankMateScenario,

  // Checkmate Families (9)
  anastasiaMateScenario,
  arabianMateScenario,
  hookMateScenario,
  vukovicMateScenario,
  bodensMateScenario,
  balestraBlackburneScenario,
  lolliDamianoOperaScenario,
  killBoxRailroadScenario,
  blindSwineSeventhScenario,

  // Endgame Basics (2)
  kingQueenMateScenario,
  kingRookMateScenario,

  // Endgame Conversions (3)
  lucenaBridgeScenario,
  philidorDefenseScenario,
  twoBishopsMateScenario,
];

/**
 * Key-value mapping of scenario ID to ChessScenario definition.
 */
export const SCENARIOS_MAP: ReadonlyMap<string, ChessScenario> = new Map(
  ALL_SCENARIOS.map((s) => [s.id, s])
);

/**
 * Retrieves a scenario by ID.
 */
export function getScenarioById(id: string): ChessScenario | undefined {
  return SCENARIOS_MAP.get(id);
}

/**
 * Returns the next sequential scenario in the curriculum, or null if on the last one.
 */
export function getNextScenario(currentId: string): ChessScenario | null {
  const index = ALL_SCENARIOS.findIndex((s) => s.id === currentId);
  if (index >= 0 && index + 1 < ALL_SCENARIOS.length) {
    return ALL_SCENARIOS[index + 1];
  }
  return null;
}

/**
 * The 9 Academy Curriculum Sections.
 */
export const CURRICULUM_SECTIONS: readonly CurriculumSection[] = [
  {
    id: 'fundamentals',
    title: 'Piece Basics & Movement',
    subtitle: 'Master how every chess piece moves, attacks, and defends!',
    icon: '🟢',
    scenarios: [
      pawnJourneyScenario,
      knightJumpsScenario,
      bishopDiagonalsScenario,
      rookLinesScenario,
      queenPowerScenario,
      kingSafetyScenario,
    ],
  },
  {
    id: 'special_moves',
    title: 'Special Rules & Powers',
    subtitle: 'Learn castling, secret en passant captures, and pawn promotion!',
    icon: '🛡️',
    scenarios: [
      castlingSafetyScenario,
      enPassantScenario,
      pawnPromotionScenario,
    ],
  },
  {
    id: 'opening_traps',
    title: 'Classic Opening Traps',
    subtitle: 'Spring Legal’s Queen Trap and survive the sizzling Fried Liver Attack!',
    icon: '⚡',
    scenarios: [
      legalsTrapScenario,
      friedLiverAttackScenario,
    ],
  },
  {
    id: 'tactical_patterns',
    title: 'Tactical Superpowers',
    subtitle: 'Unlock forks, pins, skewers, and discovered attacks to win pieces!',
    icon: '🍴',
    scenarios: [
      royalForkScenario,
      absolutePinScenario,
      deadlySkewerScenario,
      discoveredCheckScenario,
    ],
  },
  {
    id: 'intermediate_tactics',
    title: 'Advanced Tactical Motifs',
    subtitle: 'Master CCT triggers, outposts, windmills, Greek Gifts, and sneaky in-between moves!',
    icon: '💥',
    scenarios: [
      cctTriggerScenario,
      knightOutpostsScenario,
      discoveredDoubleCheckScenario,
      crossPinsBatteriesScenario,
      deflectionDecoyScenario,
      clearanceInterferenceScenario,
      greekGiftSacrificeScenario,
      windmillTornadoScenario,
      zwischenzugInBetweenScenario,
      desperadoEscapeScenario,
    ],
  },
  {
    id: 'checkmate_patterns',
    title: 'Basic Checkmate Patterns',
    subtitle: 'Execute Scholar’s Mate, defend traps, and deliver back-rank checkmates!',
    icon: '👑',
    scenarios: [
      scholarsMateAttackScenario,
      scholarsMateDefenseScenario,
      foolsMateScenario,
      backRankMateScenario,
    ],
  },
  {
    id: 'checkmate_families',
    title: 'Checkmate Pattern Families',
    subtitle: 'Master Anastasia, Arabian, Hook, Vukovic, Boden, Balestra, Opera, and Blind Swine mates!',
    icon: '🏰',
    scenarios: [
      anastasiaMateScenario,
      arabianMateScenario,
      hookMateScenario,
      vukovicMateScenario,
      bodensMateScenario,
      balestraBlackburneScenario,
      lolliDamianoOperaScenario,
      killBoxRailroadScenario,
      blindSwineSeventhScenario,
    ],
  },
  {
    id: 'endgame_basics',
    title: 'Endgame Checkmates',
    subtitle: 'Master King + Queen and King + Rook checkmates on the edge of the board!',
    icon: '🏆',
    scenarios: [
      kingQueenMateScenario,
      kingRookMateScenario,
    ],
  },
  {
    id: 'endgame_conversions',
    title: 'Endgame Conversions & Mastery',
    subtitle: 'Build the Lucena bridge, hold the Philidor defense, and dance with two Bishops!',
    icon: '🌉',
    scenarios: [
      lucenaBridgeScenario,
      philidorDefenseScenario,
      twoBishopsMateScenario,
    ],
  },
];
