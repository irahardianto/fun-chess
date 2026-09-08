import { ref, computed, onUnmounted, getCurrentInstance, onScopeDispose, getCurrentScope } from 'vue';
import type { MascotId } from '@fun-chess/shared';
import type { Move } from 'chess.js';
import { logger, generateCorrelationId, type ILogger } from '@/platform/telemetry/index.js';
import { getAiConfigForMascot } from '../data/index.js';
import { minimaxEngine } from '../engine/index.js';

export interface UseAiWorkerOptions {
  onMoveComputed?: (move: Move, isBlunder: boolean) => void;
  onCalculationFailed?: (err: unknown) => void;
  simulateThinkDelay?: boolean;
  logger?: ILogger;
}

/**
 * useAiWorker composable (MAJ-041, MAJ-007, MIN-015).
 * Encapsulates AI search execution, simulated think delay delegation,
 * isAiThinking state, blunder evaluation, 3-point structured logging, and operation cancellation.
 */
export function useAiWorker(options: UseAiWorkerOptions = {}) {
  const log = options.logger ?? logger;
  const isAiThinking = ref<boolean>(false);
  let activeOperationId = 0;
  let thinkTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearThinkTimeout(): void {
    if (thinkTimeout) {
      clearTimeout(thinkTimeout);
      thinkTimeout = null;
    }
  }

  function cancelCalculation(): void {
    activeOperationId++;
    clearThinkTimeout();
    isAiThinking.value = false;
  }

  async function requestAiMove(
    fen: string,
    mascotId: MascotId,
    legalFallbackMoves: () => Move[],
    applyMoveFn: (move: { from: string; to: string; promotion?: string }) => Move | null
  ): Promise<{ move: Move; isBlunder: boolean } | null> {
    const currentOpId = ++activeOperationId;
    const correlationId = generateCorrelationId();
    const startTime = performance.now();

    clearThinkTimeout();
    isAiThinking.value = true;

    log.debug('Starting AI move calculation', {
      operation: 'request_ai_move',
      correlationId,
      mascotId,
    });

    try {
      const config = getAiConfigForMascot(mascotId);
      const evaluation = await minimaxEngine.findBestMove(fen, config);

      if (currentOpId !== activeOperationId) {
        return null;
      }

      // Delegate simulated think delay to composable (MAJ-007)
      const [minThinkMs, maxThinkMs] = config.simulatedThinkTimeMs;
      if (maxThinkMs > 0 && options.simulateThinkDelay !== false) {
        const calculationDuration = performance.now() - startTime;
        const targetThinkMs = minThinkMs + Math.random() * (maxThinkMs - minThinkMs);
        const remainingDelay = Math.max(0, targetThinkMs - calculationDuration);
        if (remainingDelay > 0) {
          await new Promise<void>((resolve) => {
            thinkTimeout = setTimeout(() => {
              thinkTimeout = null;
              resolve();
            }, remainingDelay);
          });
          if (currentOpId !== activeOperationId) {
            return null;
          }
        }
      }

      const chosenMove = evaluation.move;
      const result = applyMoveFn({
        from: chosenMove.from,
        to: chosenMove.to,
        promotion: chosenMove.promotion,
      });

      if (!result) {
        throw new Error(`AI engine generated invalid move: ${JSON.stringify(chosenMove)}`);
      }

      const duration = Math.round(performance.now() - startTime);
      log.info('AI move calculation completed successfully', {
        operation: 'request_ai_move',
        correlationId,
        mascotId,
        duration,
        durationMs: duration,
        isBlunder: evaluation.isBlunder,
      });

      options.onMoveComputed?.(result, evaluation.isBlunder);
      return { move: result, isBlunder: evaluation.isBlunder };
    } catch (err) {
      if (currentOpId !== activeOperationId) {
        return null;
      }
      const duration = Math.round(performance.now() - startTime);
      log.error('AI calculation failed, executing emergency fallback move', {
        operation: 'request_ai_move',
        correlationId,
        mascotId,
        duration,
        durationMs: duration,
        error: err instanceof Error ? err.message : String(err),
      });
      options.onCalculationFailed?.(err);

      // Emergency fallback legal move (random or first valid move) so game never freezes
      const legalMovesList = legalFallbackMoves();
      if (legalMovesList.length > 0) {
        const fallback = legalMovesList[Math.floor(Math.random() * legalMovesList.length)];
        if (fallback) {
          const fallbackResult = applyMoveFn({
            from: fallback.from,
            to: fallback.to,
            promotion: fallback.promotion,
          });
          if (fallbackResult) {
            options.onMoveComputed?.(fallbackResult, false);
            return { move: fallbackResult, isBlunder: false };
          }
        }
      }
      return null;
    } finally {
      if (currentOpId === activeOperationId) {
        isAiThinking.value = false;
      }
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      cancelCalculation();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      cancelCalculation();
    });
  }

  return {
    isAiThinking: computed(() => isAiThinking.value),
    requestAiMove,
    cancelCalculation,
  };
}
