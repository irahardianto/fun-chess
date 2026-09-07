/**
 * @deprecated Use usePuzzleHints from './usePuzzleHints.js' instead.
 * Consolidated per MIN-015.
 */
import { usePuzzleHints, type UsePuzzleHintsOptions } from './usePuzzleHints.js';

export function useProgressiveHint(options: UsePuzzleHintsOptions = {}) {
  return usePuzzleHints(options);
}

