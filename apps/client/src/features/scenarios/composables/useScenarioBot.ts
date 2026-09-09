import { ref, onUnmounted, getCurrentInstance, onScopeDispose, getCurrentScope } from 'vue';
import type { Chess, Move } from 'chess.js';
import type { Square, PieceType, TutorialStep } from '@fun-chess/shared';
import { useInjectLogger } from '@/platform/di';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';

export interface UseScenarioBotOptions {
  chess: Chess;
  logger?: ILogger;
  onBotMoveSuccess?: (move: { from: Square; to: Square }, fen: string) => void;
  onBotMoveComplete?: (success: boolean) => void;
}

/**
 * Sub-composable managing automated opponent / bot counter-moves in scenarios (MAJ-030).
 */
export function useScenarioBot(options: UseScenarioBotOptions) {
  const logger = options.logger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);
  const isWaitingForBotResponse = ref<boolean>(false);
  let botTimer: ReturnType<typeof setTimeout> | null = null;

  function clearBotTimers(): void {
    if (botTimer) {
      clearTimeout(botTimer);
      botTimer = null;
    }
    isWaitingForBotResponse.value = false;
  }

  /**
   * Schedules and executes an automated opponent reply move after the step's configured delay.
   */
  function scheduleOpponentReply(
    opp: NonNullable<TutorialStep['opponentResponse']>,
    callbacks?: {
      onSuccess?: (move: { from: Square; to: Square }, fen: string) => void;
      onComplete?: (success: boolean) => void;
    }
  ): void {
    clearBotTimers();
    isWaitingForBotResponse.value = true;
    const delay = opp.delayMs ?? 500;

    botTimer = setTimeout(() => {
      let oppMoveSuccess = false;
      const chess = options.chess;

      try {
        const oppPromo = opp.promotion
          ? (opp.promotion.toLowerCase() as 'q' | 'r' | 'b' | 'n')
          : undefined;
        let oppRes: Move | null = null;

        try {
          oppRes = chess.move({
            from: opp.from as unknown as import('chess.js').Square,
            to: opp.to as unknown as import('chess.js').Square,
            promotion: oppPromo,
          });
        } catch (err) {
          logger.warn('Failed to apply bot response via chess engine, using fallback mutation', {
            operation: 'scenario_bot_response_engine',
            from: opp.from,
            to: opp.to,
            error: err instanceof Error ? err.message : String(err),
          });
          oppRes = null;
        }

        if (!oppRes) {
          const oppP = chess.get(opp.from as unknown as import('chess.js').Square);
          if (oppP) {
            chess.remove(opp.from as unknown as import('chess.js').Square);
            chess.put(
              { type: (oppPromo as PieceType) ?? oppP.type, color: oppP.color },
              opp.to as unknown as import('chess.js').Square
            );
            oppMoveSuccess = true;
          } else {
            logger.warn('Opponent move failed: piece not found at source square', {
              operation: 'scenario_bot_response_piece_missing',
              from: opp.from,
            });
            oppMoveSuccess = false;
          }
        } else {
          oppMoveSuccess = true;
        }

        if (oppMoveSuccess) {
          const moveData = { from: opp.from, to: opp.to };
          const fen = chess.fen();
          callbacks?.onSuccess?.(moveData, fen);
          options.onBotMoveSuccess?.(moveData, fen);
        }
      } catch (err) {
        logger.warn('Bot response execution failed', {
          operation: 'scenario_bot_response_execution',
          error: err instanceof Error ? err.message : String(err),
        });
        oppMoveSuccess = false;
      } finally {
        isWaitingForBotResponse.value = false;
        botTimer = null;
        // MAJ-025: Only advance step if move succeeded!
        callbacks?.onComplete?.(oppMoveSuccess);
        options.onBotMoveComplete?.(oppMoveSuccess);
      }
    }, delay);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearBotTimers();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearBotTimers();
    });
  }

  return {
    isWaitingForBotResponse,
    scheduleOpponentReply,
    clearBotTimers,
  };
}
