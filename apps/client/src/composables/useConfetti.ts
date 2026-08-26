import { ConfettiTrigger, defaultConfettiTrigger } from '@/platform/confetti/confetti_trigger';

export function useConfetti(customTrigger?: ConfettiTrigger) {
  const trigger = customTrigger || defaultConfettiTrigger;

  function celebrateVictory(): void {
    trigger.triggerVictoryConfetti();
  }

  function celebrateDraw(): void {
    trigger.triggerDrawCelebration();
  }

  return {
    celebrate: celebrateVictory,
    celebrateVictory,
    celebrateDraw,
    trigger,
  };
}
