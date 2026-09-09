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

  it('clear cancels pending victory center burst timeout [MIN-033]', () => {
    vi.useFakeTimers();

    trigger.triggerVictoryConfetti();
    expect(mockConfetti).toHaveBeenCalledTimes(2);

    // Call clear before the 300ms timeout
    trigger.clear();

    vi.advanceTimersByTime(500);
    // Center burst should not have fired
    expect(mockConfetti).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('clear calls reset on confettiFn if available and handles errors gracefully [MIN-033]', () => {
    const mockReset = vi.fn();
    (mockConfetti as typeof mockConfetti & { reset?: () => void }).reset = mockReset;

    expect(() => trigger.clear()).not.toThrow();
    expect(mockReset).toHaveBeenCalledTimes(1);

    // If reset throws, clear should swallow error and not crash
    mockReset.mockImplementationOnce(() => {
      throw new Error('Reset failed');
    });
    expect(() => trigger.clear()).not.toThrow();
  });

  it('dispose delegates to clear and cleans up resources [MIN-033]', () => {
    const clearSpy = vi.spyOn(trigger, 'clear');
    trigger.dispose();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
