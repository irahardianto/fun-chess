import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  usePuzzleRushTimer,
  SystemTimerService,
  MockTimerService,
} from '../usePuzzleRushTimer';

describe('usePuzzleRushTimer & ITimerService (MAJ-014)', () => {
  describe('MockTimerService', () => {
    let timerService: MockTimerService;

    beforeEach(() => {
      timerService = new MockTimerService();
    });

    it('manages timeouts deterministically without real clock waiting', () => {
      const fn = vi.fn();
      timerService.setTimeout(fn, 500);

      expect(fn).not.toHaveBeenCalled();
      timerService.flushTimeouts();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('cancels pending timeouts on clearTimeout', () => {
      const fn = vi.fn();
      const handle = timerService.setTimeout(fn, 1000);
      timerService.clearTimeout(handle);

      timerService.flushTimeouts();
      expect(fn).not.toHaveBeenCalled();
    });

    it('ticks intervals deterministically', () => {
      const fn = vi.fn();
      const handle = timerService.setInterval(fn, 1000);

      expect(fn).not.toHaveBeenCalled();
      timerService.tickInterval(handle);
      expect(fn).toHaveBeenCalledTimes(1);

      timerService.tickInterval(handle);
      expect(fn).toHaveBeenCalledTimes(2);

      timerService.clearInterval(handle);
      timerService.tickInterval(handle);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('usePuzzleRushTimer with MockTimerService', () => {
    it('initializes with default duration and not running', () => {
      const timerService = new MockTimerService();
      const timer = usePuzzleRushTimer({
        initialDurationSeconds: 120,
        timerService,
      });

      expect(timer.timeRemainingSeconds.value).toBe(120);
      expect(timer.isTimerRunning.value).toBe(false);
      expect(timer.lastTimeBonus.value).toBe(0);
    });

    it('starts timer and decrements remaining time on interval ticks', () => {
      const timerService = new MockTimerService();
      const onExpire = vi.fn();
      const timer = usePuzzleRushTimer({
        initialDurationSeconds: 10,
        timerService,
        onExpire,
      });

      timer.startTimer(10);
      expect(timer.isTimerRunning.value).toBe(true);

      timerService.tickInterval();
      expect(timer.timeRemainingSeconds.value).toBe(9);

      // Tick until expiration
      for (let i = 0; i < 9; i++) {
        timerService.tickInterval();
      }

      expect(timer.timeRemainingSeconds.value).toBe(0);
      expect(timer.isTimerRunning.value).toBe(false);
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('adds time bonus reactively', () => {
      const timerService = new MockTimerService();
      const timer = usePuzzleRushTimer({
        initialDurationSeconds: 30,
        timerService,
      });

      timer.addTimeBonus(5);
      expect(timer.lastTimeBonus.value).toBe(5);
      expect(timer.timeRemainingSeconds.value).toBe(35);
    });

    it('clears all tracked timers and timeouts on clearAllTimers', () => {
      const timerService = new MockTimerService();
      const timer = usePuzzleRushTimer({
        initialDurationSeconds: 60,
        timerService,
      });

      timer.startTimer(60);
      const fn = vi.fn();
      timer.setTrackedTimeout(fn, 500);

      timer.clearAllTimers();
      expect(timer.isTimerRunning.value).toBe(false);

      timerService.flushTimeouts();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('SystemTimerService', () => {
    it('instantiates and provides standard timer interface methods', () => {
      const service = new SystemTimerService();
      expect(typeof service.setInterval).toBe('function');
      expect(typeof service.clearInterval).toBe('function');
      expect(typeof service.setTimeout).toBe('function');
      expect(typeof service.clearTimeout).toBe('function');
    });
  });
});
