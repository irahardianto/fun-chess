import { ref, getCurrentInstance, type Ref } from 'vue';
import type {
  Square,
  PieceColor,
  PieceType,
  PromotionPiece,
  MascotPersona,
  MoveResult,
  IClock,
} from '@fun-chess/shared';
import type { Move } from 'chess.js';
import { useInjectLogger, useInjectClock } from '@/platform/di';
import { SystemClock } from '@/platform/time';
import {
  logger as defaultLogger,
  type ILogger,
} from '@/platform/telemetry';
import type { UseAiBoardStateReturn } from './useAiBoardState.js';
import type { useAiWorker } from './useAiWorker.js';
import type { useTakebackHistory } from './useTakebackHistory.js';
import type { useMascotBanter } from './useMascotBanter.js';
import { useAiGameOver, type GameCompletionOutcomeEvent } from './useAiGameOver';

export type { GameCompletionOutcomeEvent };

export interface MoveOutcomeEvent {
  type: 'move';
  from: Square;
  to: Square;
  isCapture: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
}

export interface UseAiMoveExecutionOptions {
  boardState: UseAiBoardStateReturn;
  aiWorker: ReturnType<typeof useAiWorker>;
  history: ReturnType<typeof useTakebackHistory>;
  banter: ReturnType<typeof useMascotBanter>;
  mascot: Ref<MascotPersona>;
  onMoveOutcome?: (event: MoveOutcomeEvent) => void;
  onGameCompletion?: (event: GameCompletionOutcomeEvent) => void;
  onClearSelection?: () => void;
  onClearHint?: () => void;
  logger?: ILogger;
  clock?: IClock;
}

/**
 * useAiMoveExecution composable (MAJ-021, MAJ-023, MIN-023).
 * Encapsulates move execution, AI reply dispatch, game-over evaluation,
 * and resignation. Decomposed with useAiGameOver.
 */
export function useAiMoveExecution(options: UseAiMoveExecutionOptions) {
  const logger = options.logger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);
  const clock = options.clock ?? (getCurrentInstance() ? useInjectClock() : new SystemClock());
  const {
    boardState,
    aiWorker,
    history,
    banter,
    mascot,
    onMoveOutcome,
    onGameCompletion,
    onClearSelection,
    onClearHint,
  } = options;

  const { chess, turn, playerColor, aiColor, isGameOver } = boardState;

  const lastMoveOutcome = ref<MoveOutcomeEvent | null>(null);

  // Sub-composable managing game-over logic and resignation (MAJ-021, MAJ-023)
  const gameOverHandler = useAiGameOver({
    boardState,
    history,
    banter,
    mascot,
    onGameCompletion,
    clock,
    logger,
  });

  function resetExecution(): void {
    lastMoveOutcome.value = null;
    gameOverHandler.resetMatchTimer();
  }

  function applyAiMoveResult(result: Move, isBlunder = false): void {
    const moveRes: MoveResult = {
      from: result.from,
      to: result.to,
      san: result.san,
      piece: result.piece as PieceType,
      color: result.color as PieceColor,
      captured: result.captured as PieceType | undefined,
      promotion: result.promotion as PromotionPiece | undefined,
      flags: result.flags,
      fen: chess.fen(),
      moveNumber: chess.history().length,
      timestamp: clock.now(),
    };

    history.recordMove(moveRes);
    boardState.updateLocalState();

    const moveOutcome: MoveOutcomeEvent = {
      type: 'move',
      from: result.from as Square,
      to: result.to as Square,
      isCapture: Boolean(result.captured),
      isCheck: chess.inCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
    };
    lastMoveOutcome.value = moveOutcome;
    onMoveOutcome?.(moveOutcome);

    // Check for Game Over after AI move
    if (gameOverHandler.checkAndHandleGameOver()) {
      return;
    }

    // Contextual Dialogue Triggers for AI move
    if (chess.inCheck()) {
      banter.triggerBanter('ai_check');
    } else if (isBlunder) {
      banter.triggerBanter('ai_blunder');
    } else {
      banter.triggerBanter('ai_move');
    }
  }

  async function dispatchAiMove(): Promise<void> {
    if (isGameOver.value || chess.turn() !== aiColor.value) {
      return;
    }

    await aiWorker.requestAiMove(
      chess.fen(),
      mascot.value.id,
      () => (chess.isGameOver() ? [] : chess.moves({ verbose: true })),
      (move) => {
        const res = chess.move({
          from: move.from as unknown as import('chess.js').Square,
          to: move.to as unknown as import('chess.js').Square,
          promotion: move.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
        });
        if (res) {
          applyAiMoveResult(res, false);
        }
        return res;
      }
    );
  }

  function applyPlayerMove(
    from: Square,
    to: Square,
    promotion?: 'q' | 'r' | 'b' | 'n'
  ): boolean {
    const isPlayerTurn =
      !isGameOver.value && !aiWorker.isAiThinking.value && turn.value === playerColor.value;

    if (!isPlayerTurn) return false;

    // Snapshot board state prior to human move for Takeback / Undo
    const snapshot = history.createSnapshot(
      chess.fen(),
      chess.turn() as PieceColor,
      boardState.capturedWhite.value,
      boardState.capturedBlack.value
    );

    try {
      const result = chess.move({
        from: from as unknown as import('chess.js').Square,
        to: to as unknown as import('chess.js').Square,
        promotion,
      });

      if (!result) {
        logger.warn('Invalid player move rejected by chess engine', {
          operation: 'apply_player_move',
          from,
          to,
          promotion,
        });
        return false;
      }

      // Commit snapshot to takeback stack
      history.pushSnapshot(snapshot);
      onClearHint?.();

      const moveRes: MoveResult = {
        from: result.from,
        to: result.to,
        san: result.san,
        piece: result.piece as PieceType,
        color: result.color as PieceColor,
        captured: result.captured as PieceType | undefined,
        promotion: result.promotion as PromotionPiece | undefined,
        flags: result.flags,
        fen: chess.fen(),
        moveNumber: chess.history().length,
        timestamp: clock.now(),
      };

      history.recordMove(moveRes);
      onClearSelection?.();
      boardState.updateLocalState();

      const outcomeEvent: MoveOutcomeEvent = {
        type: 'move',
        from: result.from as Square,
        to: result.to as Square,
        isCapture: Boolean(result.captured),
        isCheck: chess.inCheck(),
        isCheckmate: chess.isCheckmate(),
        isDraw: chess.isDraw(),
      };
      lastMoveOutcome.value = outcomeEvent;
      onMoveOutcome?.(outcomeEvent);

      // Check Game Over after player move
      if (gameOverHandler.checkAndHandleGameOver()) {
        return true;
      }

      // Mascot banter reaction
      if (chess.inCheck()) {
        banter.triggerBanter('player_check');
      } else if (result.captured) {
        banter.triggerBanter('player_move');
      }

      // Schedule AI opponent response
      dispatchAiMove();
      return true;
    } catch (err) {
      logger.warn('Exception applying player move', {
        operation: 'apply_player_move',
        from,
        to,
        promotion,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  function resign(): void {
    gameOverHandler.resign(() => aiWorker.cancelCalculation());
  }

  return {
    lastMoveOutcome,
    lastGameCompletion: gameOverHandler.lastGameCompletion,
    checkAndHandleGameOver: () => gameOverHandler.checkAndHandleGameOver(),
    applyAiMoveResult,
    dispatchAiMove,
    applyPlayerMove,
    resign,
    resetExecution,
  };
}

export type UseAiMoveExecutionReturn = ReturnType<typeof useAiMoveExecution>;
