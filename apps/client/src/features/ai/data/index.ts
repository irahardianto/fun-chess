import type {
  MascotId,
  MascotPersona,
  AiSearchConfig,
} from '@fun-chess/shared';
import { peanutPup } from './personas/peanut_pup.js';
import { sparkySquirrel } from './personas/sparky_squirrel.js';
import { cleverFox } from './personas/clever_fox.js';
import { grandmasterOwl } from './personas/grandmaster_owl.js';

export { peanutPup } from './personas/peanut_pup.js';
export { sparkySquirrel } from './personas/sparky_squirrel.js';
export { cleverFox } from './personas/clever_fox.js';
export { grandmasterOwl } from './personas/grandmaster_owl.js';

/**
 * Registry of all available animal mascot personas.
 */
export const MASCOT_PERSONAS: Record<MascotId, MascotPersona> = {
  peanut: peanutPup,
  sparky: sparkySquirrel,
  fox: cleverFox,
  owl: grandmasterOwl,
};

/**
 * Ordered array of all mascot personas from lowest to highest ELO.
 */
export const ALL_MASCOTS: readonly MascotPersona[] = [
  peanutPup,
  sparkySquirrel,
  cleverFox,
  grandmasterOwl,
];

/**
 * Retrieves a mascot persona by its ID with a safe fallback to peanutPup.
 */
export function getMascotPersona(id: MascotId): MascotPersona {
  return MASCOT_PERSONAS[id] ?? peanutPup;
}

/**
 * Calibrated Minimax search engine parameters calibrated for each mascot tier.
 */
export const MASCOT_SEARCH_CONFIGS: Record<MascotId, AiSearchConfig> = {
  // Peanut the Pup: Level 1 Novice (~400 ELO) — High blunder rate, no PST, depth 1
  peanut: {
    depth: 1,
    blunderChance: 0.40,
    maxBlunderScoreDrop: 400,
    evaluationNoise: 60,
    usePst: false,
    useQuiescence: false,
    simulatedThinkTimeMs: [400, 800],
  },
  // Sparky the Squirrel: Level 2 Beginner (~900 ELO) — Moderate blunder, PST enabled, depth 2
  sparky: {
    depth: 2,
    blunderChance: 0.20,
    maxBlunderScoreDrop: 250,
    evaluationNoise: 30,
    usePst: true,
    useQuiescence: false,
    simulatedThinkTimeMs: [500, 900],
  },
  // Clever Fox: Level 3 Intermediate (~1300 ELO) — Low blunder, tactical quiescence, depth 3
  fox: {
    depth: 3,
    blunderChance: 0.08,
    maxBlunderScoreDrop: 120,
    evaluationNoise: 15,
    usePst: true,
    useQuiescence: true,
    simulatedThinkTimeMs: [600, 1000],
  },
  // Grandmaster Owl: Level 4 Master (~1700 ELO) — Zero blunder, deep minimax search, depth 4
  owl: {
    depth: 4,
    blunderChance: 0.0,
    maxBlunderScoreDrop: 0,
    evaluationNoise: 0,
    usePst: true,
    useQuiescence: true,
    simulatedThinkTimeMs: [700, 1200],
  },
};

/**
 * Retrieves the calibrated AI search configuration for a given mascot.
 */
export function getAiConfigForMascot(id: MascotId): AiSearchConfig {
  return MASCOT_SEARCH_CONFIGS[id] ?? MASCOT_SEARCH_CONFIGS.peanut;
}
