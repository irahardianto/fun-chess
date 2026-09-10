import { computed } from 'vue';
import type { Move, Square as ChessSquare } from 'chess.js';
import type {
  Square,
  PieceType,
  TutorialStep,
} from '@fun-chess/shared';
import { createSafeChess, isPawnPromotion } from '@fun-chess/shared';
import {
  validateStepMove,
  isSourceSquareAllowed,
} from '../engine/scenario_validator';
import { useBoardSelection } from '../../board/index';
import type { ILogger } from '@/platform/telemetry';
import type { useScenarioStepNavigation } from './useScenarioStepNavigation';
import type { useScenarioBot } from './useScenarioBot';
import type { useScenarioHints } from './useScenarioHints';
import type { useScenarioFeedback } from './useScenarioFeedback';

export interface UseScenarioMoveExecutionOptions {
  chess: ReturnType<typeof createSafeChess>;
  nav: ReturnType<typeof useScenarioStepNavigation>;
  bot: ReturnType<typeof useScenarioBot>;
  feedback: ReturnType<typeof useScenarioFeedback>;
  hints: ReturnType<typeof useScenarioHints>;
  logger: ILogger;
}

export interface UseScenarioMoveExecutionReturn {
  boardSelection: ReturnType<typeof useBoardSelection>;
  getLegalMovesForSquare: (sq: Square) => Square[];
  checkIsPromotionMove: (from: Square, to: Square) => boolean;
  applyPlayerMove: (move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) => boolean;
  selectSquare: (sq: Square) => void;
  completePromotion: (pieceType: 'q' | 'r' | 'b' | 'n') => boolean;
  cancelPromotion: () => void;
}

/**
 * Move execution, validation, engine state mutation, and square selection
 * sub-composable for interactive chess tutorial scenarios (MAJ-026).
 */
export function useScenarioMoveExecution(options: UseScenarioMoveExecutionOptions): UseScenarioMoveExecutionReturn {
  const { chess, nav, bot, feedback, hints, logger } = options;

  function getLegalMovesForSquare(sq: Square): Square[] {
    try {
      const moves = chess.moves({
        square: sq as unknown as ChessSquare,
        verbose: true,
      });
      return moves.map((m) => m.to as Square);
    } catch (err) {
      logger.warn('Failed to compute legal moves for square', {
        operation: 'scenario_legal_moves',
        square: sq,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  function checkIsPromotionMove(from: Square, to: Square): boolean {
    return isPawnPromotion(from, to, chess);
  }

  function handleFailedPlayerMove(): void {
    feedback.recordMistake();
    // Auto-hint reveal after 2 mistakes (SC-4 UX Polish)
    hints.checkAutoHint(feedback.mistakesCurrentAttempt.value, nav.currentStep.value);
    boardSelection.clearSelection();
  }

  function executePlayerMoveOnEngine(
    step: TutorialStep,
    move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }
  ): { isCheckmate: boolean } {
    const promoChar = move.promotion ? (move.promotion.toLowerCase() as 'q' | 'r' | 'b' | 'n') : 'q';
    const isPromo = checkIsPromotionMove(move.from, move.to);
    let res: Move | null = null;

    try {
      res = chess.move({
        from: move.from as unknown as ChessSquare,
        to: move.to as unknown as ChessSquare,
        promotion: isPromo ? promoChar : undefined,
      });
    } catch (err) {
      logger.warn('Failed to apply move via chess engine, using fallback board mutation', {
        operation: 'scenario_player_move_engine',
        from: move.from,
        to: move.to,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!res) {
      const p = chess.get(move.from as unknown as ChessSquare);
      if (p) {
        chess.remove(move.from as unknown as ChessSquare);
        chess.put(
          { type: isPromo ? (promoChar as PieceType) : p.type, color: p.color },
          move.to as unknown as ChessSquare
        );
      }
    }

    nav.currentFen.value = chess.fen();
    const successMsg = chess.isCheckmate()
      ? 'Checkmate! Beautiful finish! 🏆'
      : step.explanationOnSuccess;
    feedback.recordSuccess({ from: move.from, to: move.to }, successMsg);
    boardSelection.clearSelection();

    return { isCheckmate: chess.isCheckmate() };
  }

  function applyPlayerMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }): boolean {
    if (!nav.currentStep.value || bot.isWaitingForBotResponse.value || nav.isCompleted.value) {
      return false;
    }

    const step = nav.currentStep.value;
    const validation = validateStepMove(step, move, chess);

    if (!validation.valid) {
      handleFailedPlayerMove();
      return false;
    }

    try {
      const { isCheckmate } = executePlayerMoveOnEngine(step, move);

      if (isCheckmate) {
        nav.advanceOrCompleteStep();
        return true;
      }

      if (step.opponentResponse) {
        bot.scheduleOpponentReply(step.opponentResponse);
      } else {
        nav.advanceOrCompleteStep();
      }

      return true;
    } catch (err) {
      logger.warn('Failed to apply player move', {
        operation: 'scenario_apply_player_move',
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  const boardSelection = useBoardSelection({
    getPieceAt: (sq) => {
      try {
        const piece = chess.get(sq as unknown as ChessSquare);
        if (!piece) return null;
        return { type: piece.type, color: piece.color as 'w' | 'b' };
      } catch (err) {
        logger.warn('Failed to inspect piece at square', {
          operation: 'scenario_get_piece',
          square: sq,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
    getLegalMovesForSquare: (sq) => getLegalMovesForSquare(sq),
    currentTurn: computed(() => nav.playerColor.value as 'w' | 'b'),
    playerColor: computed(() => nav.playerColor.value as 'w' | 'b'),
    executeMove: (from, to, promotion) => applyPlayerMove({ from, to, promotion }),
  });

  function selectSquare(sq: Square): void {
    if (bot.isWaitingForBotResponse.value || nav.isCompleted.value) return;

    if (boardSelection.selectedSquare.value && boardSelection.isLegalTarget(sq)) {
      boardSelection.handleSquareClick(sq);
      return;
    }

    try {
      const piece = chess.get(sq as unknown as ChessSquare);
      const isPieceOfPlayer = piece && piece.color === nav.playerColor.value;
      const stepAllowedSource = nav.currentStep.value
        ? isSourceSquareAllowed(nav.currentStep.value, sq, chess)
        : false;

      if (isPieceOfPlayer || stepAllowedSource) {
        boardSelection.handleSquareClick(sq);
        return;
      }
    } catch (err) {
      logger.warn('Failed to check piece on square selection', {
        operation: 'scenario_select_square_check',
        square: sq,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    boardSelection.clearSelection();
  }

  function completePromotion(pieceType: 'q' | 'r' | 'b' | 'n'): boolean {
    return boardSelection.completePromotion(pieceType);
  }

  function cancelPromotion(): void {
    boardSelection.cancelPromotion();
  }

  return {
    boardSelection,
    getLegalMovesForSquare,
    checkIsPromotionMove,
    applyPlayerMove,
    selectSquare,
    completePromotion,
    cancelPromotion,
  };
}
