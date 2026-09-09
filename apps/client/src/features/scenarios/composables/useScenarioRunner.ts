import { ref, computed, readonly, onUnmounted, getCurrentInstance, onScopeDispose, getCurrentScope } from 'vue';
import type { Move } from 'chess.js';
import type {
  Square,
  PieceType,
  TutorialStep,
  ChessScenario,
  StarRating,
} from '@fun-chess/shared';
import { createSafeChess, safeLoadFen, isPawnPromotion } from '@fun-chess/shared';
import {
  validateStepMove,
  isSourceSquareAllowed,
} from '../engine/scenario_validator';
import { calculateStars, calculateAccuracy } from '../engine/star_calculator';
import { useBoardSelection } from '../../board/index';
import { useInjectLogger } from '@/platform/di';
import { logger as defaultLogger, type ILogger } from '@/platform/telemetry';
import {
  useScenarioStepNavigation,
  type ScenarioStepOutcomeEvent,
} from './useScenarioStepNavigation';
import { useScenarioBot } from './useScenarioBot';
import { useScenarioHints } from './useScenarioHints';

export type { ScenarioStepOutcomeEvent };

export interface UseScenarioRunnerOptions {
  scenario?: ChessScenario | null;
  logger?: ILogger;
  onStepOutcome?: (event: ScenarioStepOutcomeEvent) => void;
}

/**
 * Orchestrator composable for interactive chess tutorial scenarios (MAJ-030).
 * Composes useScenarioStepNavigation, useScenarioBot, useScenarioHints, and useBoardSelection.
 */
export function useScenarioRunner(options?: UseScenarioRunnerOptions | ChessScenario) {
  const optionsObj: UseScenarioRunnerOptions =
    options && 'steps' in options
      ? { scenario: options }
      : options ?? {};

  const logger = optionsObj.logger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);

  const initialScenario = optionsObj.scenario ?? null;
  const initialFenStr =
    initialScenario?.steps[0]?.setupFen ??
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Internal chess.js engine instance
  const chess = createSafeChess(initialFenStr);

  // Attempt statistics & UI animation state
  const mistakesCurrentAttempt = ref<number>(0);
  const feedbackMessage = ref<string | null>(null);
  const isStepSuccess = ref<boolean>(false);
  const isShaking = ref<boolean>(false);
  const lastMove = ref<{ from: string; to: string } | null>(null);
  let shakeTimer: ReturnType<typeof setTimeout> | null = null;

  function syncEngineFen(fenStr: string): string {
    try {
      safeLoadFen(chess, fenStr);
      return chess.fen();
    } catch (err) {
      logger.warn('Failed to load FEN into engine, using fallback string', {
        operation: 'scenario_sync_fen',
        fen: fenStr,
        error: err instanceof Error ? err.message : String(err),
      });
      return fenStr;
    }
  }

  // 1. Hints Sub-Composable (MAJ-030)
  const hints = useScenarioHints({
    currentStep: computed(() => nav.currentStep.value),
  });

  // 2. Board Selection State Machine (MIN-010)
  const boardSelection = useBoardSelection({
    getPieceAt: (sq) => {
      try {
        const piece = chess.get(sq as unknown as import('chess.js').Square);
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

  // 3. Navigation Sub-Composable (MAJ-030)
  const nav = useScenarioStepNavigation({
    scenario: initialScenario,
    onStepOutcome: (event) => optionsObj.onStepOutcome?.(event),
    onStepLoaded: () => {
      hints.resetStepHints();
      feedbackMessage.value = null;
      isStepSuccess.value = false;
      isShaking.value = false;
      lastMove.value = null;
      boardSelection.clearSelection();
    },
    getStarsAwarded: () => calculatedStars.value,
    syncEngineFen,
  });

  // 4. Bot Counter-Move Sub-Composable (MAJ-030)
  const bot = useScenarioBot({
    chess,
    logger,
    onBotMoveSuccess: (move, fen) => {
      nav.currentFen.value = fen;
      lastMove.value = move;
    },
    onBotMoveComplete: (success) => {
      if (success) {
        nav.advanceOrCompleteStep();
      }
    },
  });

  // Derived Performance Metrics
  const calculatedStars = computed<StarRating>(() => {
    return calculateStars(hints.hintsUsedCurrentAttempt.value, mistakesCurrentAttempt.value);
  });

  const accuracy = computed<number>(() => {
    return calculateAccuracy(nav.totalSteps.value, mistakesCurrentAttempt.value);
  });

  const isMyTurn = computed<boolean>(() => {
    if (bot.isWaitingForBotResponse.value || nav.isCompleted.value) return false;
    return true;
  });

  function clearShakeTimer(): void {
    if (shakeTimer) {
      clearTimeout(shakeTimer);
      shakeTimer = null;
    }
  }

  function getLegalMovesForSquare(sq: Square): Square[] {
    try {
      const moves = chess.moves({
        square: sq as unknown as import('chess.js').Square,
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
    mistakesCurrentAttempt.value++;
    isShaking.value = true;
    feedbackMessage.value = 'Not quite! Look for the goal square or tap 💡 Hint for a clue.';

    // Auto-hint reveal after 2 mistakes (SC-4 UX Polish)
    hints.checkAutoHint(mistakesCurrentAttempt.value, nav.currentStep.value);

    clearShakeTimer();
    shakeTimer = setTimeout(() => {
      isShaking.value = false;
    }, 400);

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
        from: move.from as unknown as import('chess.js').Square,
        to: move.to as unknown as import('chess.js').Square,
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
      // Fallback for tutorial board state
      const p = chess.get(move.from as unknown as import('chess.js').Square);
      if (p) {
        chess.remove(move.from as unknown as import('chess.js').Square);
        chess.put(
          { type: isPromo ? (promoChar as PieceType) : p.type, color: p.color },
          move.to as unknown as import('chess.js').Square
        );
      }
    }

    nav.currentFen.value = chess.fen();
    lastMove.value = { from: move.from, to: move.to };
    isStepSuccess.value = true;
    feedbackMessage.value = chess.isCheckmate()
      ? 'Checkmate! Beautiful finish! 🏆'
      : step.explanationOnSuccess;
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

    // Move is valid for this tutorial step! Execute move
    try {
      const { isCheckmate } = executePlayerMoveOnEngine(step, move);

      // Sound alternative checkmate: if move delivers sound checkmate, accept immediately!
      if (isCheckmate) {
        nav.advanceOrCompleteStep();
        return true;
      }

      // Check if there is an automated opponent response
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

  function selectSquare(sq: Square): void {
    if (bot.isWaitingForBotResponse.value || nav.isCompleted.value) return;

    // If square already selected and clicked square is in legal moves
    if (boardSelection.selectedSquare.value && boardSelection.isLegalTarget(sq)) {
      boardSelection.handleSquareClick(sq);
      return;
    }

    // Check if clicked square has a piece belonging to player or is allowed source for tutorial
    try {
      const piece = chess.get(sq as unknown as import('chess.js').Square);
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

    // Deselect if empty or invalid
    boardSelection.clearSelection();
  }

  function completePromotion(pieceType: 'q' | 'r' | 'b' | 'n'): boolean {
    return boardSelection.completePromotion(pieceType);
  }

  function cancelPromotion(): void {
    boardSelection.cancelPromotion();
  }

  function loadScenario(newScenario: ChessScenario, initialStepIdx = 0): void {
    bot.clearBotTimers();
    clearShakeTimer();
    hints.resetAllHints();
    mistakesCurrentAttempt.value = 0;
    nav.loadScenario(newScenario, initialStepIdx);
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearShakeTimer();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearShakeTimer();
    });
  }

  return {
    scenario: readonly(nav.scenario),
    currentStepIndex: readonly(nav.currentStepIndex),
    currentStep: nav.currentStep,
    currentFen: readonly(nav.currentFen),
    playerColor: nav.playerColor,
    isMyTurn,
    totalSteps: nav.totalSteps,
    isCompleted: readonly(nav.isCompleted),
    hintsUsedCurrentAttempt: readonly(hints.hintsUsedCurrentAttempt),
    mistakesCurrentAttempt: readonly(mistakesCurrentAttempt),
    activeHint: readonly(hints.activeHint),
    hintGlowSquare: readonly(hints.hintGlowSquare),
    hintTargetSquare: readonly(hints.hintTargetSquare),
    isWaitingForBotResponse: readonly(bot.isWaitingForBotResponse),
    feedbackMessage: readonly(feedbackMessage),
    isStepSuccess: readonly(isStepSuccess),
    isShaking: readonly(isShaking),
    calculatedStars,
    accuracy,
    lastStepOutcome: readonly(nav.lastStepOutcome),
    selectedSquare: computed(() => boardSelection.selectedSquare.value),
    legalMoves: computed(() => boardSelection.legalMovesForSelected.value),
    lastMove: readonly(lastMove),
    pendingPromotion: computed(() => boardSelection.pendingPromotion.value),
    loadScenario,
    loadStep: nav.loadStep,
    selectSquare,
    applyPlayerMove,
    completePromotion,
    cancelPromotion,
    revealHint: hints.revealHint,
    resetCurrentStep: nav.resetCurrentStep,
    nextStep: nav.nextStep,
  };
}
