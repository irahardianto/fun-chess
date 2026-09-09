import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Chess } from 'chess.js';
import { useScenarioBot } from '../useScenarioBot';

describe('useScenarioBot composable (MAJ-030)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with isWaitingForBotResponse set to false', () => {
    const chess = new Chess();
    const bot = useScenarioBot({ chess });
    expect(bot.isWaitingForBotResponse.value).toBe(false);
  });

  it('schedules opponent reply, sets waiting state, executes move, and calls completion callback', () => {
    const chess = new Chess();
    const onBotMoveSuccess = vi.fn();
    const onBotMoveComplete = vi.fn();

    const bot = useScenarioBot({
      chess,
      onBotMoveSuccess,
      onBotMoveComplete,
    });

    bot.scheduleOpponentReply({
      from: 'e7',
      to: 'e5',
      delayMs: 300,
    });

    expect(bot.isWaitingForBotResponse.value).toBe(true);

    vi.advanceTimersByTime(300);

    expect(bot.isWaitingForBotResponse.value).toBe(false);
    expect(onBotMoveSuccess).toHaveBeenCalledWith(
      { from: 'e7', to: 'e5' },
      expect.any(String)
    );
    expect(onBotMoveComplete).toHaveBeenCalledWith(true);
    expect(chess.get('e5')?.type).toBe('p');
  });

  it('handles fallback board mutation when move is non-standard but piece exists', () => {
    // Custom setup FEN where e7 has pawn
    const chess = new Chess('4k3/4p3/8/8/8/8/4P3/4K3 b - - 0 1');
    const onBotMoveSuccess = vi.fn();
    const onBotMoveComplete = vi.fn();

    const bot = useScenarioBot({
      chess,
      onBotMoveSuccess,
      onBotMoveComplete,
    });

    // An unusual move that might need fallback
    bot.scheduleOpponentReply({
      from: 'e7',
      to: 'e6',
      delayMs: 200,
    });

    vi.advanceTimersByTime(200);

    expect(bot.isWaitingForBotResponse.value).toBe(false);
    expect(onBotMoveComplete).toHaveBeenCalledWith(true);
  });

  it('handles bot move failure gracefully when source square is empty and reports false', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chess = new Chess('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1');
    const onBotMoveComplete = vi.fn();

    const bot = useScenarioBot({
      chess,
      onBotMoveComplete,
    });

    // a8 has no piece
    bot.scheduleOpponentReply({
      from: 'a8',
      to: 'a7',
      delayMs: 200,
    });

    vi.advanceTimersByTime(200);

    expect(bot.isWaitingForBotResponse.value).toBe(false);
    expect(onBotMoveComplete).toHaveBeenCalledWith(false);
  });

  it('cancels pending bot reply timer via clearBotTimers', () => {
    const chess = new Chess();
    const onBotMoveComplete = vi.fn();

    const bot = useScenarioBot({
      chess,
      onBotMoveComplete,
    });

    bot.scheduleOpponentReply({
      from: 'e7',
      to: 'e5',
      delayMs: 500,
    });

    expect(bot.isWaitingForBotResponse.value).toBe(true);

    bot.clearBotTimers();
    expect(bot.isWaitingForBotResponse.value).toBe(false);

    vi.advanceTimersByTime(600);
    expect(onBotMoveComplete).not.toHaveBeenCalled();
  });
});
