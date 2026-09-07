import { ref, type Ref } from 'vue';
import type {
  Square,
  PieceColor,
  PieceType,
  MascotPersona,
  GameOverPayload,
  MoveResult,
} from '@fun-chess/shared';
import type { Move } from 'chess.js';
import { logger } from '@/platform/telemetry/index.js';
import type { UseAiBoardStateReturn } from './useAiBoardState.js';
import type { useAiWorker } from './useAiWorker.js';
import type { useTakebackHistory } from './useTakebackHistory.js';
import type { useMascotBanter } from './useMascotBanter.js';

export interface MoveOutcomeEvent {
  type: 'move';
  from: Square;
  to: Square;
  isCapture: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
}

export interface GameCompletionOutcomeEvent {
  type: 'game_over';
  winner: 'w' | 'b' | 'draw';
  reason: 'checkmate' | 'stalemate' | 'resignation' | 'timeout' | 'agreement';
  isLocalPlayerWinner: boolean;
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
}

/**
 * useAiMoveExecution composable (MIN-023).
 * Encapsulates move execution, AI reply dispatch, game-over evaluation,
 * and resignation.
 */
export function useAiMoveExecution(options: UseAiMoveExecutionOptions) {
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

  const { chess, turn, playerColor, aiColor, isGameOver, lastGameOver } = boardState;
  const { requestAiMove, cancelCalculation } = aiWorker;

  const lastMoveOutcome = ref<MoveOutcomeEvent | null>(null);
  const lastGameCompletion = ref<GameCompletionOutcomeEvent | null>(null);
  let matchStartTime = Date.now();

  function resetExecution(): void {
    lastMoveOutcome.value = null;
    lastGameCompletion.value = null;
    matchStartTime = Date.now();
  }

  function checkAndHandleGameOver(): boolean {
    if (!chess.isGameOver()) return false;

    isGameOver.value = true;
    const durationSeconds = Math.max(1, Math.round((Date.now() - matchStartTime) / 1000));
    const totalMoves = history.moveHistory.value.length;

    let payload: GameOverPayload;

    if (chess.isCheckmate()) {
      const winnerColor: PieceColor = chess.turn() === 'w' ? 'b' : 'w';
      const isPlayerWin = winnerColor === playerColor.value;
      const winnerName = isPlayerWin ? 'You' : mascot.value.name;

      payload = {
        winner: winnerColor,
        winnerName,
        reason: 'checkmate',
        message: isPlayerWin
          ? `Checkmate! You defeated ${mascot.value.name}! 🏆`
          : `Checkmate! ${mascot.value.name} won this game!`,
        finalFen: chess.fen(),
        totalMoves,
        durationSeconds,
      };

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

      payload = {
        winner: 'draw',
        reason,
        message: 'The match ended in a draw! ⚖️',
        finalFen: chess.fen(),
        totalMoves,
        durationSeconds,
      };

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

  function applyAiMoveResult(result: Move, isBlunder = false): void {
    const moveRes: MoveResult = {
      from: result.from,
      to: result.to,
      san: result.san,
      piece: result.piece as PieceType,
      color: result.color as PieceColor,
      captured: result.captured as PieceType | undefined,
      promotion: result.promotion as PieceType | undefined,
      flags: result.flags,
      fen: chess.fen(),
      moveNumber: chess.history().length,
      timestamp: Date.now(),
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
    if (checkAndHandleGameOver()) {
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

    await requestAiMove(
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
        promotion: result.promotion as PieceType | undefined,
        flags: result.flags,
        fen: chess.fen(),
        moveNumber: chess.history().length,
        timestamp: Date.now(),
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
      if (checkAndHandleGameOver()) {
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
    if (isGameOver.value) return;

    cancelCalculation();
    isGameOver.value = true;

    const durationSeconds = Math.max(1, Math.round((Date.now() - matchStartTime) / 1000));
    const payload: GameOverPayload = {
      winner: aiColor.value,
      winnerName: mascot.value.name,
      reason: 'resignation',
      message: `You resigned. ${mascot.value.name} won! 🏳️`,
      finalFen: chess.fen(),
      totalMoves: history.moveHistory.value.length,
      durationSeconds,
    };

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
  }

  return {
    lastMoveOutcome,
    lastGameCompletion,
    checkAndHandleGameOver,
    applyAiMoveResult,
    dispatchAiMove,
    applyPlayerMove,
    resign,
    resetExecution,
  };
}

export type UseAiMoveExecutionReturn = ReturnType<typeof useAiMoveExecution>;
