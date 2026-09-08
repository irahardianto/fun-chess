import type { ChessScenario, CurriculumSection } from '@fun-chess/shared';

// 1. Fundamentals (8)
import { boardCoordinatesScenario } from './fundamentals/board_coordinates';
import { pawnJourneyScenario } from './fundamentals/pawn_journey';
import { knightJumpsScenario } from './fundamentals/knight_jumps';
import { bishopDiagonalsScenario } from './fundamentals/bishop_diagonals';
import { rookLinesScenario } from './fundamentals/rook_lines';
import { queenPowerScenario } from './fundamentals/queen_power';
import { kingSafetyScenario } from './fundamentals/king_safety';
import { pieceValuesScenario } from './fundamentals/piece_values';

// 2. Check, Checkmate & Stalemate (3)
import { cprCheckEscapeScenario } from './checkmates/cpr_check_escape';
import { stalemateVsCheckmateScenario } from './checkmates/stalemate_vs_checkmate';
import { backRankMateScenario } from './checkmates/back_rank_mate';

// 3. Special Rules & Powers (3)
import { castlingSafetyScenario } from './special_moves/castling_safety';
import { enPassantScenario } from './special_moves/en_passant_secret';
import { pawnPromotionScenario } from './special_moves/pawn_promotion';

// 4. Opening Rules & Traps (6)
import { openingPrinciplesScenario } from './special_moves/opening_principles';
import { foolsMateScenario } from './checkmates/fools_mate';
import { scholarsMateAttackScenario } from './checkmates/scholars_mate_attack';
import { scholarsMateDefenseScenario } from './checkmates/scholars_mate_defense';
import { legalsTrapScenario } from './special_moves/legals_trap';
import { friedLiverAttackScenario } from './special_moves/fried_liver_attack';

// 5. Essential Endgame Checkmates (3)
import { kingQueenMateScenario } from './endgame/king_queen_mate';
import { kingRookMateScenario } from './endgame/king_rook_mate';
import { kingPawnEndgameScenario } from './endgame/king_pawn_endgame';

// 6. Tactical Superpowers & Checkmate Patterns (19)
import { royalForkScenario } from './tactics/royal_fork';
import { absolutePinScenario } from './tactics/absolute_pin';
import { deadlySkewerScenario } from './tactics/deadly_skewer';
import { discoveredCheckScenario } from './tactics/discovered_check';
import { cctTriggerScenario } from './tactics/cct_trigger';
import { knightOutpostsScenario } from './tactics/knight_outposts';
import { discoveredDoubleCheckScenario } from './tactics/discovered_double_check';
import { crossPinsBatteriesScenario } from './tactics/cross_pins_batteries';
import { deflectionDecoyScenario } from './tactics/deflection_decoy';
import { clearanceInterferenceScenario } from './tactics/clearance_interference';
import { anastasiaMateScenario } from './checkmates/anastasia_mate';
import { arabianMateScenario } from './checkmates/arabian_mate';
import { hookMateScenario } from './checkmates/hook_mate';
import { vukovicMateScenario } from './checkmates/vukovic_mate';
import { bodensMateScenario } from './checkmates/bodens_mate';
import { balestraBlackburneScenario } from './checkmates/balestra_blackburne';
import { lolliDamianoOperaScenario } from './checkmates/lolli_damiano_opera';
import { killBoxRailroadScenario } from './checkmates/kill_box_railroad';
import { blindSwineSeventhScenario } from './checkmates/blind_swine_seventh';

// 7. Master Motifs & Advanced Endgames (7)
import { greekGiftSacrificeScenario } from './tactics/greek_gift_sacrifice';
import { windmillTornadoScenario } from './tactics/windmill_tornado';
import { zwischenzugInBetweenScenario } from './tactics/zwischenzug_in_between';
import { desperadoEscapeScenario } from './tactics/desperado_escape';
import { twoBishopsMateScenario } from './endgame/two_bishops_mate';
import { lucenaBridgeScenario } from './endgame/lucena_bridge';
import { philidorDefenseScenario } from './endgame/philidor_defense';

// Re-export all individual scenarios
export * from './fundamentals/board_coordinates';
export * from './fundamentals/pawn_journey';
export * from './fundamentals/knight_jumps';
export * from './fundamentals/bishop_diagonals';
export * from './fundamentals/rook_lines';
export * from './fundamentals/queen_power';
export * from './fundamentals/king_safety';
export * from './fundamentals/piece_values';

export * from './checkmates/cpr_check_escape';
export * from './checkmates/stalemate_vs_checkmate';
export * from './checkmates/back_rank_mate';

export * from './special_moves/castling_safety';
export * from './special_moves/en_passant_secret';
export * from './special_moves/pawn_promotion';

export * from './special_moves/opening_principles';
export * from './checkmates/fools_mate';
export * from './checkmates/scholars_mate_attack';
export * from './checkmates/scholars_mate_defense';
export * from './special_moves/legals_trap';
export * from './special_moves/fried_liver_attack';

export * from './endgame/king_queen_mate';
export * from './endgame/king_rook_mate';
export * from './endgame/king_pawn_endgame';

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
export * from './checkmates/anastasia_mate';
export * from './checkmates/arabian_mate';
export * from './checkmates/hook_mate';
export * from './checkmates/vukovic_mate';
export * from './checkmates/bodens_mate';
export * from './checkmates/balestra_blackburne';
export * from './checkmates/lolli_damiano_opera';
export * from './checkmates/kill_box_railroad';
export * from './checkmates/blind_swine_seventh';

export * from './tactics/greek_gift_sacrifice';
export * from './tactics/windmill_tornado';
export * from './tactics/zwischenzug_in_between';
export * from './tactics/desperado_escape';
export * from './endgame/two_bishops_mate';
export * from './endgame/lucena_bridge';
export * from './endgame/philidor_defense';

/**
 * All 49 curated scenarios for the Chess Academy, arranged in progressive pedagogical order:
 * Fundamentals -> Check & Checkmate -> Special Moves -> Endgame Checkmates -> Tactics -> Opening Rules & Traps -> Advanced Endgames.
 */
export const ALL_SCENARIOS: readonly ChessScenario[] = [
  // 1. Fundamentals (8)
  boardCoordinatesScenario,
  pawnJourneyScenario,
  knightJumpsScenario,
  bishopDiagonalsScenario,
  rookLinesScenario,
  queenPowerScenario,
  kingSafetyScenario,
  pieceValuesScenario,

  // 2. Check & Checkmate (3)
  cprCheckEscapeScenario,
  stalemateVsCheckmateScenario,
  backRankMateScenario,

  // 3. Special Moves (3)
  castlingSafetyScenario,
  enPassantScenario,
  pawnPromotionScenario,

  // 4. Endgame Checkmates (3)
  kingQueenMateScenario,
  kingRookMateScenario,
  kingPawnEndgameScenario,

  // 5. Tactics (19)
  royalForkScenario,
  absolutePinScenario,
  deadlySkewerScenario,
  discoveredCheckScenario,
  cctTriggerScenario,
  knightOutpostsScenario,
  discoveredDoubleCheckScenario,
  crossPinsBatteriesScenario,
  deflectionDecoyScenario,
  clearanceInterferenceScenario,
  anastasiaMateScenario,
  arabianMateScenario,
  hookMateScenario,
  vukovicMateScenario,
  bodensMateScenario,
  balestraBlackburneScenario,
  lolliDamianoOperaScenario,
  killBoxRailroadScenario,
  blindSwineSeventhScenario,

  // 6. Opening Rules & Traps (6)
  openingPrinciplesScenario,
  foolsMateScenario,
  scholarsMateAttackScenario,
  scholarsMateDefenseScenario,
  legalsTrapScenario,
  friedLiverAttackScenario,

  // 7. Advanced Endgames (7)
  greekGiftSacrificeScenario,
  windmillTornadoScenario,
  zwischenzugInBetweenScenario,
  desperadoEscapeScenario,
  twoBishopsMateScenario,
  lucenaBridgeScenario,
  philidorDefenseScenario,
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
    return ALL_SCENARIOS[index + 1] ?? null;
  }
  return null;
}

/**
 * The 7 Pedagogically Reorganized Academy Curriculum Sections:
 * Fundamentals -> Check & Checkmate -> Special Moves -> Endgame Checkmates -> Tactics -> Opening Rules & Traps -> Advanced Endgames.
 */
export const CURRICULUM_SECTIONS: readonly CurriculumSection[] = [
  {
    id: 'fundamentals',
    title: 'Fundamentals: Piece Basics & Movement',
    subtitle: 'Master board coordinates and how every chess piece moves, attacks, and defends!',
    icon: '🟢',
    scenarios: [
      boardCoordinatesScenario,
      pawnJourneyScenario,
      knightJumpsScenario,
      bishopDiagonalsScenario,
      rookLinesScenario,
      queenPowerScenario,
      kingSafetyScenario,
      pieceValuesScenario,
    ],
  },
  {
    id: 'checkmate_patterns',
    title: 'Check, Checkmate & Stalemate',
    subtitle: 'Learn the CPR check escape, avoid stalemate traps, and deliver back-rank checkmates!',
    icon: '👑',
    scenarios: [
      cprCheckEscapeScenario,
      stalemateVsCheckmateScenario,
      backRankMateScenario,
    ],
  },
  {
    id: 'special_moves',
    title: 'Special Rules & Powers',
    subtitle: 'Learn castling fortress defense, secret en passant captures, and pawn promotion!',
    icon: '🛡️',
    scenarios: [
      castlingSafetyScenario,
      enPassantScenario,
      pawnPromotionScenario,
    ],
  },
  {
    id: 'endgame_basics',
    title: 'Endgame Checkmates & Technique',
    subtitle: 'Master King + Queen, King + Rook, and fundamental King & Pawn passed pawn endings!',
    icon: '🏆',
    scenarios: [
      kingQueenMateScenario,
      kingRookMateScenario,
      kingPawnEndgameScenario,
    ],
  },
  {
    id: 'tactical_patterns',
    title: 'Tactical Superpowers & Combinations',
    subtitle: 'Unlock forks, pins, skewers, discovered attacks, and famous checkmate combinations!',
    icon: '🍴',
    scenarios: [
      royalForkScenario,
      absolutePinScenario,
      deadlySkewerScenario,
      discoveredCheckScenario,
      cctTriggerScenario,
      knightOutpostsScenario,
      discoveredDoubleCheckScenario,
      crossPinsBatteriesScenario,
      deflectionDecoyScenario,
      clearanceInterferenceScenario,
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
    id: 'opening_traps',
    title: 'Opening Rules & Classic Traps',
    subtitle: 'Master the 3 Golden Rules, execute Scholar’s Mate, and spring Legal’s Queen Trap!',
    icon: '⚡',
    scenarios: [
      openingPrinciplesScenario,
      foolsMateScenario,
      scholarsMateAttackScenario,
      scholarsMateDefenseScenario,
      legalsTrapScenario,
      friedLiverAttackScenario,
    ],
  },
  {
    id: 'endgame_conversions',
    title: 'Advanced Endgames & Mastery',
    subtitle: 'Master Greek Gift sacrifices, windmills, desperados, two Bishops, Lucena, and Philidor!',
    icon: '🌉',
    scenarios: [
      greekGiftSacrificeScenario,
      windmillTornadoScenario,
      zwischenzugInBetweenScenario,
      desperadoEscapeScenario,
      twoBishopsMateScenario,
      lucenaBridgeScenario,
      philidorDefenseScenario,
    ],
  },
];
