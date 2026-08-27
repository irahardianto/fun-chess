import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useConfetti } from '../useConfetti';
import { ConfettiTrigger, defaultConfettiTrigger } from '@/platform/confetti/confetti_trigger';

describe('useConfetti composable', () => {
  let mockTrigger: ConfettiTrigger;

  beforeEach(() => {
    mockTrigger = new ConfettiTrigger();
    vi.spyOn(mockTrigger, 'triggerVictoryConfetti').mockImplementation(() => {});
    vi.spyOn(mockTrigger, 'triggerDrawCelebration').mockImplementation(() => {});
  });

  it('uses defaultConfettiTrigger when no custom trigger is provided', () => {
    const { trigger } = useConfetti();
    expect(trigger).toBe(defaultConfettiTrigger);
  });

  it('uses custom injected ConfettiTrigger when provided', () => {
    const { trigger } = useConfetti(mockTrigger);
    expect(trigger).toBe(mockTrigger);
  });

  it('delegates celebrate() to trigger.triggerVictoryConfetti()', () => {
    const { celebrate } = useConfetti(mockTrigger);
    celebrate();
    expect(mockTrigger.triggerVictoryConfetti).toHaveBeenCalledTimes(1);
  });

  it('delegates celebrateVictory() to trigger.triggerVictoryConfetti()', () => {
    const { celebrateVictory } = useConfetti(mockTrigger);
    celebrateVictory();
    expect(mockTrigger.triggerVictoryConfetti).toHaveBeenCalledTimes(1);
  });

  it('delegates celebrateDraw() to trigger.triggerDrawCelebration()', () => {
    const { celebrateDraw } = useConfetti(mockTrigger);
    celebrateDraw();
    expect(mockTrigger.triggerDrawCelebration).toHaveBeenCalledTimes(1);
  });
});
