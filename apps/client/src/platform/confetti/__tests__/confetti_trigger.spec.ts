import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfettiTrigger } from '../confetti_trigger';

describe('ConfettiTrigger', () => {
  let mockConfetti: ReturnType<typeof vi.fn>;
  let trigger: ConfettiTrigger;

  beforeEach(() => {
    mockConfetti = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    trigger = new ConfettiTrigger(mockConfetti as unknown as typeof import('canvas-confetti'));
  });

  it('should trigger victory confetti with multiple cannon angles and colors', () => {
    vi.useFakeTimers();

    trigger.triggerVictoryConfetti();

    // Two cannons immediately fired (left and right)
    expect(mockConfetti).toHaveBeenCalledTimes(2);
    expect(mockConfetti).toHaveBeenCalledWith(
      expect.objectContaining({
        angle: 60,
        particleCount: 60,
      })
    );
    expect(mockConfetti).toHaveBeenCalledWith(
      expect.objectContaining({
        angle: 120,
        particleCount: 60,
      })
    );

    // Center burst fired after timeout
    vi.advanceTimersByTime(300);
    expect(mockConfetti).toHaveBeenCalledTimes(3);
    expect(mockConfetti).toHaveBeenLastCalledWith(
      expect.objectContaining({
        particleCount: 80,
        spread: 100,
      })
    );

    vi.useRealTimers();
  });

  it('should trigger draw celebration with neutral palette', () => {
    trigger.triggerDrawCelebration();

    expect(mockConfetti).toHaveBeenCalledTimes(1);
    expect(mockConfetti).toHaveBeenCalledWith(
      expect.objectContaining({
        particleCount: 40,
        colors: ['#94a3b8', '#64748b', '#cbd5e1'],
      })
    );
  });

  it('should allow custom confetti invocation', () => {
    trigger.triggerCustom({ particleCount: 25, spread: 45 });

    expect(mockConfetti).toHaveBeenCalledWith({ particleCount: 25, spread: 45 });
  });

  it('should suppress all celebrations when prefers-reduced-motion is active', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    trigger.triggerVictoryConfetti();
    trigger.triggerDrawCelebration();
    trigger.triggerCustom({ particleCount: 50 });

    expect(mockConfetti).not.toHaveBeenCalled();
  });

  it('should not throw if confetti function throws or fails', () => {
    const errorConfetti = vi.fn(() => {
      throw new Error('Canvas not supported');
    });
    const errorTrigger = new ConfettiTrigger(errorConfetti as unknown as typeof import('canvas-confetti'));

    expect(() => {
      errorTrigger.triggerVictoryConfetti();
      errorTrigger.triggerDrawCelebration();
      errorTrigger.triggerCustom();
    }).not.toThrow();
  });
});
