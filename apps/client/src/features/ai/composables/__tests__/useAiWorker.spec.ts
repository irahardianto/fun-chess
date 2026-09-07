import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAiWorker } from '../useAiWorker';
import { minimaxEngine } from '../../engine/index';
import type { Move } from 'chess.js';

describe('useAiWorker composable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with isAiThinking set to false', () => {
    const { isAiThinking } = useAiWorker();
    expect(isAiThinking.value).toBe(false);
  });

  it('should successfully calculate, apply move, and invoke onMoveComputed callback', async () => {
    const onMoveComputed = vi.fn();
    const { isAiThinking, requestAiMove } = useAiWorker({ onMoveComputed, simulateThinkDelay: false });

    const mockMove = { from: 'e7', to: 'e5', color: 'b' } as Move;
    vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue({
      move: { from: 'e7', to: 'e5' },
      score: 10,
      depth: 2,
      nodesEvaluated: 15,
      isBlunder: false,
      searchDurationMs: 8,
    });

    const applyMoveFn = vi.fn().mockReturnValue(mockMove);
    const legalFallback = vi.fn().mockReturnValue([mockMove]);

    const promise = requestAiMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'peanut',
      legalFallback,
      applyMoveFn
    );

    expect(isAiThinking.value).toBe(true);

    const result = await promise;

    expect(result).toEqual({ move: mockMove, isBlunder: false });
    expect(applyMoveFn).toHaveBeenCalledWith({ from: 'e7', to: 'e5', promotion: undefined });
    expect(onMoveComputed).toHaveBeenCalledWith(mockMove, false);
    expect(isAiThinking.value).toBe(false);
  });

  it('should handle blunder move identification correctly', async () => {
    const onMoveComputed = vi.fn();
    const { requestAiMove } = useAiWorker({ onMoveComputed, simulateThinkDelay: false });

    const blunderMove = { from: 'g8', to: 'h6', color: 'b' } as Move;
    vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue({
      move: { from: 'g8', to: 'h6' },
      score: -200,
      depth: 1,
      nodesEvaluated: 5,
      isBlunder: true,
      searchDurationMs: 4,
    });

    const applyMoveFn = vi.fn().mockReturnValue(blunderMove);

    const result = await requestAiMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'peanut',
      () => [blunderMove],
      applyMoveFn
    );

    expect(result).toEqual({ move: blunderMove, isBlunder: true });
    expect(onMoveComputed).toHaveBeenCalledWith(blunderMove, true);
  });

  it('should discard in-flight calculation when cancelCalculation() is invoked', async () => {
    const onMoveComputed = vi.fn();
    const { isAiThinking, requestAiMove, cancelCalculation } = useAiWorker({ onMoveComputed, simulateThinkDelay: false });

    let resolveMinimax: (val: import('@fun-chess/shared').AiMoveEvaluation) => void;
    vi.spyOn(minimaxEngine, 'findBestMove').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMinimax = resolve;
        })
    );

    const applyMoveFn = vi.fn();
    const promise = requestAiMove(
      'fen',
      'peanut',
      () => [],
      applyMoveFn
    );

    expect(isAiThinking.value).toBe(true);

    // Cancel in-flight
    cancelCalculation();
    expect(isAiThinking.value).toBe(false);

    // Later, the search resolves
    resolveMinimax!({
      move: { from: 'e7', to: 'e5' },
      score: 0,
      depth: 1,
      nodesEvaluated: 1,
      isBlunder: false,
      searchDurationMs: 5,
    });

    const result = await promise;
    expect(result).toBeNull();
    expect(applyMoveFn).not.toHaveBeenCalled();
    expect(onMoveComputed).not.toHaveBeenCalled();
    expect(isAiThinking.value).toBe(false);
  });

  it('should fall back to emergency legal move when minimaxEngine throws an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCalculationFailed = vi.fn();
    const onMoveComputed = vi.fn();
    const { isAiThinking, requestAiMove } = useAiWorker({
      onCalculationFailed,
      onMoveComputed,
      simulateThinkDelay: false,
    });

    const failureError = new Error('Minimax timeout failure');
    vi.spyOn(minimaxEngine, 'findBestMove').mockRejectedValue(failureError);

    const fallbackMove = { from: 'b8', to: 'c6', color: 'b' } as Move;
    const applyMoveFn = vi.fn().mockReturnValue(fallbackMove);
    const legalFallbackMoves = vi.fn().mockReturnValue([fallbackMove]);

    const result = await requestAiMove(
      'fen',
      'peanut',
      legalFallbackMoves,
      applyMoveFn
    );

    expect(onCalculationFailed).toHaveBeenCalledWith(failureError);
    expect(applyMoveFn).toHaveBeenCalledWith({
      from: 'b8',
      to: 'c6',
      promotion: undefined,
    });
    expect(onMoveComputed).toHaveBeenCalledWith(fallbackMove, false);
    expect(result).toEqual({ move: fallbackMove, isBlunder: false });
    expect(isAiThinking.value).toBe(false);
  });

  it('should return null when engine throws and no legal fallback moves exist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCalculationFailed = vi.fn();
    const { requestAiMove } = useAiWorker({ onCalculationFailed, simulateThinkDelay: false });

    vi.spyOn(minimaxEngine, 'findBestMove').mockRejectedValue(new Error('Engine crash'));

    const result = await requestAiMove(
      'fen',
      'peanut',
      () => [], // No legal moves available
      vi.fn()
    );

    expect(onCalculationFailed).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('should trigger emergency fallback when engine returns an invalid move rejected by applyMoveFn', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCalculationFailed = vi.fn();
    const { requestAiMove } = useAiWorker({ onCalculationFailed, simulateThinkDelay: false });

    vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue({
      move: { from: 'a1', to: 'a8' }, // Invalid move
      score: 0,
      depth: 1,
      nodesEvaluated: 1,
      isBlunder: false,
      searchDurationMs: 5,
    });

    const fallbackMove = { from: 'e7', to: 'e5', color: 'b' } as Move;

    // First call with invalid move returns null, second call with fallback returns fallbackMove
    const applyMoveFn = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(fallbackMove);

    const result = await requestAiMove(
      'fen',
      'peanut',
      () => [fallbackMove],
      applyMoveFn
    );

    expect(onCalculationFailed).toHaveBeenCalled();
    expect(result).toEqual({ move: fallbackMove, isBlunder: false });
  });

  it('should cancel calculation on scope dispose', async () => {
    const { effectScope } = await import('vue');
    const scope = effectScope();
    let worker: ReturnType<typeof useAiWorker>;
    scope.run(() => {
      worker = useAiWorker({ simulateThinkDelay: false });
    });

    vi.spyOn(minimaxEngine, 'findBestMove').mockImplementation(() => new Promise(() => {}));
    worker!.requestAiMove('fen', 'peanut', () => [], vi.fn());
    expect(worker!.isAiThinking.value).toBe(true);

    scope.stop();
    expect(worker!.isAiThinking.value).toBe(false);
  });

  it('should return null if cancelled while calculation failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onCalculationFailed = vi.fn();
    const { requestAiMove, cancelCalculation } = useAiWorker({ onCalculationFailed, simulateThinkDelay: false });

    let rejectPromise: (err: unknown) => void;
    vi.spyOn(minimaxEngine, 'findBestMove').mockImplementation(
      () => new Promise((_, reject) => { rejectPromise = reject; })
    );

    const promise = requestAiMove('fen', 'peanut', () => [], vi.fn());
    cancelCalculation();

    rejectPromise!(new Error('Fail after cancel'));
    const result = await promise;
    expect(result).toBeNull();
    expect(onCalculationFailed).not.toHaveBeenCalled();
  });

  it('delegates simulated thinking delay when enabled (MAJ-007)', async () => {
    const onMoveComputed = vi.fn();
    const { requestAiMove } = useAiWorker({ onMoveComputed, simulateThinkDelay: true });

    const mockMove = { from: 'e7', to: 'e5', color: 'b' } as Move;
    vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue({
      move: { from: 'e7', to: 'e5' },
      score: 10,
      depth: 1,
      nodesEvaluated: 5,
      isBlunder: false,
      searchDurationMs: 2,
    });

    const start = performance.now();
    await requestAiMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      'sparky', // sparky simulatedThinkTimeMs: [150, 350]
      () => [mockMove],
      () => mockMove
    );
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});
