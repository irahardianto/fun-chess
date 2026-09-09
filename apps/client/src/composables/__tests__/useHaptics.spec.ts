import { describe, it, expect, vi } from 'vitest';
import { useHaptics } from '../useHaptics';
import type { IHapticsService } from '@/platform/hardware';

describe('useHaptics (MIN-015)', () => {
  const createMockHaptics = (overrides?: Partial<IHapticsService>): IHapticsService => ({
    isSupported: vi.fn(() => true),
    vibrate: vi.fn(() => true),
    ...overrides,
  });

  it('checks support via haptics service', () => {
    const mock = createMockHaptics({ isSupported: vi.fn(() => false) });
    const { isSupported } = useHaptics(mock);
    expect(isSupported()).toBe(false);
    expect(mock.isSupported).toHaveBeenCalledOnce();
  });

  it('triggers specific haptic patterns for each domain action', () => {
    const mock = createMockHaptics();
    const haptics = useHaptics(mock);

    expect(haptics.triggerMove()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith(12);

    expect(haptics.triggerCapture()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith([20, 30, 20]);

    expect(haptics.triggerCheck()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith([40, 40, 40]);

    expect(haptics.triggerCheckmate()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith([60, 60, 120]);

    expect(haptics.triggerVictory()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith([50, 50, 100, 50, 150]);

    expect(haptics.triggerError()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith(50);

    expect(haptics.triggerTurnNotification()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith([30, 50, 30]);

    expect(haptics.triggerStarEarned()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith([30, 40, 60]);

    expect(haptics.triggerStepComplete()).toBe(true);
    expect(mock.vibrate).toHaveBeenCalledWith([25, 35, 50]);
  });

  it('catches and handles vibration errors safely returning false without throwing', () => {
    const mock = createMockHaptics({
      vibrate: vi.fn(() => {
        throw new Error('Device vibration blocked');
      }),
    });
    const haptics = useHaptics(mock);

    expect(haptics.triggerMove()).toBe(false);
  });
});
