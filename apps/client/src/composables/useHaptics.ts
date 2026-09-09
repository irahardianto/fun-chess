/**
 * Dedicated haptics composable abstracting device vibration patterns (MIN-015, MIN-017).
 */
import {
  type IHapticsService,
  defaultHapticsService,
} from '../platform/hardware/index.js';
import { logger } from '../platform/telemetry/index.js';

export interface UseHapticsReturn {
  isSupported: () => boolean;
  triggerHaptic: (pattern: number | number[]) => boolean;
  triggerMove: () => boolean;
  triggerCapture: () => boolean;
  triggerCheck: () => boolean;
  triggerCheckmate: () => boolean;
  triggerVictory: () => boolean;
  triggerError: () => boolean;
  triggerTurnNotification: () => boolean;
  triggerStarEarned: () => boolean;
  triggerStepComplete: () => boolean;
}

/**
 * Dedicated haptics composable abstracting device vibration patterns (MIN-015, MIN-017).
 */
export function useHaptics(injectedHaptics?: IHapticsService): UseHapticsReturn {
  const haptics: IHapticsService = injectedHaptics || defaultHapticsService;

  function triggerHaptic(pattern: number | number[]): boolean {
    try {
      return haptics.vibrate(pattern);
    } catch (err) {
      logger.debug('Haptic vibration failed', {
        operation: 'haptics_trigger',
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  function triggerMove(): boolean {
    return triggerHaptic(12);
  }

  function triggerCapture(): boolean {
    return triggerHaptic([20, 30, 20]);
  }

  function triggerCheck(): boolean {
    return triggerHaptic([40, 40, 40]);
  }

  function triggerCheckmate(): boolean {
    return triggerHaptic([60, 60, 120]);
  }

  function triggerVictory(): boolean {
    return triggerHaptic([50, 50, 100, 50, 150]);
  }

  function triggerError(): boolean {
    return triggerHaptic(50);
  }

  function triggerTurnNotification(): boolean {
    return triggerHaptic([30, 50, 30]);
  }

  function triggerStarEarned(): boolean {
    return triggerHaptic([30, 40, 60]);
  }

  function triggerStepComplete(): boolean {
    return triggerHaptic([25, 35, 50]);
  }

  function isSupported(): boolean {
    return haptics.isSupported();
  }

  return {
    isSupported,
    triggerHaptic,
    triggerMove,
    triggerCapture,
    triggerCheck,
    triggerCheckmate,
    triggerVictory,
    triggerError,
    triggerTurnNotification,
    triggerStarEarned,
    triggerStepComplete,
  };
}
