import { ref, computed, onUnmounted, getCurrentInstance, onScopeDispose, getCurrentScope } from 'vue';
import type { MascotId } from '@fun-chess/shared';
import type { Move } from 'chess.js';
import { getAiConfigForMascot } from '../data/index.js';
import { minimaxEngine } from '../engine/index.js';

export interface UseAiWorkerOptions {
  onMoveComputed?: (move: Move, isBlunder: boolean) => void;
  onCalculationFailed?: (err: unknown) => void;
}

/**
 * useAiWorker composable (MAJ-041).
 * Encapsulates AI search execution, isAiThinking state, blunder evaluation,
 * and operation cancellation.
 */
export function useAiWorker(options: UseAiWorkerOptions = {}) {
  const isAiThinking = ref<boolean>(false);
  let activeOperationId = 0;

  function cancelCalculation(): void {
    activeOperationId++;
    isAiThinking.value = false;
  }

  async function requestAiMove(
    fen: string,
    mascotId: MascotId,
    legalFallbackMoves: () => Move[],
    applyMoveFn: (move: { from: string; to: string; promotion?: string }) => Move | null
  ): Promise<{ move: Move; isBlunder: boolean } | null> {
    const currentOpId = ++activeOperationId;
    isAiThinking.value = true;

    try {
      const config = getAiConfigForMascot(mascotId);
      const evaluation = await minimaxEngine.findBestMove(fen, config);

      if (currentOpId !== activeOperationId) {
        return null;
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

      options.onMoveComputed?.(result, evaluation.isBlunder);
      return { move: result, isBlunder: evaluation.isBlunder };
    } catch (err) {
      if (currentOpId !== activeOperationId) {
        return null;
      }
      console.error('[useAiWorker] AI calculation failed, executing emergency fallback move:', err);
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
