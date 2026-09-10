import { ref, type Ref } from 'vue';
import type {
  PieceColor,
  MascotPersona,
  GameOverPayload,
  IClock,
} from '@fun-chess/shared';
import { createGameOverPayload, serializeError } from '@fun-chess/shared';
import { generateCorrelationId, type ILogger } from '@/platform/telemetry';
import type { UseAiBoardStateReturn } from './useAiBoardState.js';
import type { useTakebackHistory } from './useTakebackHistory.js';
import type { useMascotBanter } from './useMascotBanter.js';

export interface GameCompletionOutcomeEvent {
  type: 'game_over';
  winner: 'w' | 'b' | 'draw';
  reason: 'checkmate' | 'stalemate' | 'resignation' | 'timeout' | 'agreement';
  isLocalPlayerWinner: boolean;
}

export interface UseAiGameOverOptions {
  boardState: UseAiBoardStateReturn;
  history: ReturnType<typeof useTakebackHistory>;
  banter: ReturnType<typeof useMascotBanter>;
  mascot: Ref<MascotPersona>;
  onGameCompletion?: (event: GameCompletionOutcomeEvent) => void;
  clock: IClock;
  logger: ILogger;
}

/**
 * Sub-composable managing AI game-over state, payload construction, and resignation (MAJ-021, MAJ-023).
 */
export function useAiGameOver(options: UseAiGameOverOptions) {
  const { boardState, history, banter, mascot, onGameCompletion, clock, logger } = options;
  const { chess, playerColor, aiColor, isGameOver, lastGameOver } = boardState;

  const lastGameCompletion = ref<GameCompletionOutcomeEvent | null>(null);
  let matchStartTime = clock.now();

  function resetMatchTimer(): void {
    lastGameCompletion.value = null;
    matchStartTime = clock.now();
  }

  function checkAndHandleGameOver(): boolean {
    if (!chess.isGameOver()) return false;

    isGameOver.value = true;
    const totalMoves = history.moveHistory.value.length;

    let payload: GameOverPayload;

    if (chess.isCheckmate()) {
      const winnerColor: PieceColor = chess.turn() === 'w' ? 'b' : 'w';
      const isPlayerWin = winnerColor === playerColor.value;
      const winnerName = isPlayerWin ? 'You' : mascot.value.name;

      payload = createGameOverPayload({
        winner: winnerColor,
        winnerName,
        reason: 'checkmate',
        message: isPlayerWin
          ? `Checkmate! You defeated ${mascot.value.name}! 🏆`
          : `Checkmate! ${mascot.value.name} won this game!`,
        finalFen: chess.fen(),
        totalMoves,
        startTimeMs: matchStartTime,
        nowMs: clock.now(),
      });

      if (isPlayerWin) {
        banter.triggerBanter('player_win');
      } else {
        banter.triggerBanter('ai_win');
      }
    } else {
      let reason: GameOverPayload['reason'] = 'draw_agreement';
      if (chess.isStalemate()) reason = 'stalemate';
      else if (chess.isThreefoldRepetition()) reason = 'threefold_repetition';
      else if (chess.isInsufficientMaterial()) reason = 'insufficient_material';

      payload = createGameOverPayload({
        winner: 'draw',
        reason,
        message: 'The match ended in a draw! ⚖️',
        finalFen: chess.fen(),
        totalMoves,
        startTimeMs: matchStartTime,
        nowMs: clock.now(),
      });

      banter.triggerBanter('draw');
    }

    lastGameOver.value = payload;

    const completionOutcome: GameCompletionOutcomeEvent = {
      type: 'game_over',
      winner: payload.winner,
      reason:
        payload.reason === 'draw_agreement'
          ? 'agreement'
          : (payload.reason as GameCompletionOutcomeEvent['reason']),
      isLocalPlayerWinner: payload.winner === playerColor.value,
    };
    lastGameCompletion.value = completionOutcome;
    onGameCompletion?.(completionOutcome);

    return true;
  }

  function resign(cancelCalculation?: () => void): void {
    if (isGameOver.value) return;

    const correlationId = generateCorrelationId();
    const startTime = clock.now();

    logger.info('Resigning AI game', {
      operation: 'ai_resign',
      correlationId,
      playerColor: playerColor.value,
      aiColor: aiColor.value,
    });

    try {
      cancelCalculation?.();
      isGameOver.value = true;

      const payload: GameOverPayload = createGameOverPayload({
        winner: aiColor.value,
        winnerName: mascot.value.name,
        loserName: 'You',
        reason: 'resignation',
        message: `You resigned. ${mascot.value.name} won! 🏳️`,
        finalFen: chess.fen(),
        totalMoves: history.moveHistory.value.length,
        startTimeMs: matchStartTime,
        nowMs: clock.now(),
      });

      lastGameOver.value = payload;
      banter.triggerBanter('ai_win');

      const completionOutcome: GameCompletionOutcomeEvent = {
        type: 'game_over',
        winner: aiColor.value,
        reason: 'resignation',
        isLocalPlayerWinner: false,
      };
      lastGameCompletion.value = completionOutcome;
      onGameCompletion?.(completionOutcome);

      const durationMs = Math.round(clock.now() - startTime);

      logger.info('Resignation completed successfully', {
        operation: 'ai_resign',
        correlationId,
        status: 'success',
        duration: durationMs,
        durationMs,
        winner: aiColor.value,
        totalMoves: payload.totalMoves,
      });
    } catch (err) {
      const durationMs = Math.round(clock.now() - startTime);

      logger.error('Resignation failed', {
        operation: 'ai_resign',
        correlationId,
        status: 'failed',
        duration: durationMs,
        durationMs,
        error: serializeError(err),
      });
      throw err;
    }
  }

  return {
    lastGameCompletion,
    resetMatchTimer,
    checkAndHandleGameOver,
    resign,
  };
}

export type UseAiGameOverReturn = ReturnType<typeof useAiGameOver>;
