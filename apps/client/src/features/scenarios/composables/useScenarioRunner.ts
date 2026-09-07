import { ref, computed, readonly, onUnmounted, getCurrentInstance } from 'vue';
import type {
  Square,
  PieceColor,
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

export interface ScenarioStepOutcomeEvent {
  type: 'scenario_step_completed';
  starsAwarded: number;
  isLessonComplete: boolean;
}

export interface UseScenarioRunnerOptions {
  scenario?: ChessScenario | null;
  onStepOutcome?: (event: ScenarioStepOutcomeEvent) => void;
}

export function useScenarioRunner(options?: UseScenarioRunnerOptions | ChessScenario) {
  const optionsObj: UseScenarioRunnerOptions =
    options && 'steps' in options
      ? { scenario: options }
      : options ?? {};

  const initialScenario = optionsObj.scenario ?? null;

  // Reactive State
  const scenario = ref<ChessScenario | null>(initialScenario);
  const currentStepIndex = ref<number>(0);
  const currentFen = ref<string>(
    initialScenario?.steps[0]?.setupFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  );

  const hintsUsedCurrentAttempt = ref<number>(0);
  const mistakesCurrentAttempt = ref<number>(0);
  const activeHint = ref<string | null>(null);
  const hintGlowSquare = ref<Square | null>(null);
  const hintTargetSquare = ref<Square | null>(null);

  const isWaitingForBotResponse = ref<boolean>(false);
  const feedbackMessage = ref<string | null>(null);
  const isStepSuccess = ref<boolean>(false);
  const isCompleted = ref<boolean>(false);
  const isShaking = ref<boolean>(false);

  const lastMove = ref<{ from: string; to: string } | null>(null);
  const lastStepOutcome = ref<ScenarioStepOutcomeEvent | null>(null);

  // Internal chess.js engine instance
  const chess = createSafeChess(currentFen.value);

  // Active timers
  let botTimer: ReturnType<typeof setTimeout> | null = null;
  let shakeTimer: ReturnType<typeof setTimeout> | null = null;
  let nextStepTimer: ReturnType<typeof setTimeout> | null = null;

  // Computed Properties
  const totalSteps = computed(() => scenario.value?.steps.length ?? 0);

  const currentStep = computed<TutorialStep | null>(() => {
    if (!scenario.value || scenario.value.steps.length === 0) return null;
    return scenario.value.steps[currentStepIndex.value] ?? null;
  });

  const playerColor = computed<PieceColor>(() => {
    return currentStep.value?.playerColor ?? 'w';
  });

  const isMyTurn = computed<boolean>(() => {
    if (isWaitingForBotResponse.value || isCompleted.value) return false;
    return true;
  });

  const calculatedStars = computed<StarRating>(() => {
    return calculateStars(hintsUsedCurrentAttempt.value, mistakesCurrentAttempt.value);
  });

  const accuracy = computed<number>(() => {
    return calculateAccuracy(totalSteps.value, mistakesCurrentAttempt.value);
  });

  function clearTimers(): void {
    if (botTimer) {
      clearTimeout(botTimer);
      botTimer = null;
    }
    if (shakeTimer) {
      clearTimeout(shakeTimer);
      shakeTimer = null;
    }
    if (nextStepTimer) {
      clearTimeout(nextStepTimer);
      nextStepTimer = null;
    }
  }

  function syncEngineFen(fenStr: string): void {
    try {
      safeLoadFen(chess, fenStr);
      currentFen.value = chess.fen();
    } catch (err) {
      console.warn('[useScenarioRunner] safeLoadFen failed, using fallback string:', err);
      currentFen.value = fenStr;
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
      console.warn('[useScenarioRunner] chess.moves failed:', err);
      return [];
    }
  }

  function checkIsPromotionMove(from: Square, to: Square): boolean {
    return isPawnPromotion(from, to, chess);
  }

  function loadStep(stepIdx: number): void {
    clearTimers();
    if (!scenario.value || stepIdx < 0 || stepIdx >= scenario.value.steps.length) {
      return;
    }

    currentStepIndex.value = stepIdx;
    const step = scenario.value.steps[stepIdx];
    syncEngineFen(step.setupFen);

    activeHint.value = null;
    hintGlowSquare.value = null;
    hintTargetSquare.value = null;
    feedbackMessage.value = null;
    isStepSuccess.value = false;
    isWaitingForBotResponse.value = false;
    isShaking.value = false;
    lastMove.value = null;
    boardSelection.clearSelection();
  }

  function loadScenario(newScenario: ChessScenario, initialStepIdx = 0): void {
    clearTimers();
    scenario.value = newScenario;
    hintsUsedCurrentAttempt.value = 0;
    mistakesCurrentAttempt.value = 0;
    isCompleted.value = false;
    loadStep(initialStepIdx);
  }

  function applyPlayerMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }): boolean {
    if (!currentStep.value || isWaitingForBotResponse.value || isCompleted.value) {
      return false;
    }

    const step = currentStep.value;
    const isValidForStep = validateStepMove(step, move, chess);

    if (!isValidForStep) {
      // Wrong move attempted! Non-punitive feedback
      mistakesCurrentAttempt.value++;
      isShaking.value = true;
      feedbackMessage.value = 'Not quite! Look for the goal square or tap 💡 Hint for a clue.';

      // Auto-hint reveal after 2 mistakes (SC-4 UX Polish)
      if (mistakesCurrentAttempt.value >= 2 && !activeHint.value) {
        revealHint();
      }

      if (shakeTimer) clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => {
        isShaking.value = false;
      }, 400);

      boardSelection.clearSelection();
      return false;
    }

    // Move is valid for this tutorial step! Execute move
    try {
      const promoChar = move.promotion ? (move.promotion.toLowerCase() as 'q' | 'r' | 'b' | 'n') : 'q';
      const isPromo = checkIsPromotionMove(move.from, move.to);
      let res: any = null;

      try {
        res = chess.move({
          from: move.from as unknown as import('chess.js').Square,
          to: move.to as unknown as import('chess.js').Square,
          promotion: isPromo ? promoChar : undefined,
        });
      } catch (err) {
        console.warn('[useScenarioRunner] chess.move error, using fallback board mutation:', err);
        res = null;
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

      currentFen.value = chess.fen();
      lastMove.value = { from: move.from, to: move.to };
      isStepSuccess.value = true;
      feedbackMessage.value = chess.isCheckmate()
        ? 'Checkmate! Beautiful finish! 🏆'
        : step.explanationOnSuccess;
      boardSelection.clearSelection();

      // Sound alternative checkmate: if move delivers sound checkmate, accept immediately!
      if (chess.isCheckmate()) {
        advanceOrCompleteStep();
        return true;
      }

      // Check if there is an automated opponent response
      if (step.opponentResponse) {
        const opp = step.opponentResponse;
        isWaitingForBotResponse.value = true;
        const delay = opp.delayMs ?? 500;

        botTimer = setTimeout(() => {
          let oppMoveSuccess = false;
          try {
            const oppPromo = opp.promotion
              ? (opp.promotion.toLowerCase() as 'q' | 'r' | 'b' | 'n')
              : undefined;
            let oppRes: any = null;

            try {
              oppRes = chess.move({
                from: opp.from as unknown as import('chess.js').Square,
                to: opp.to as unknown as import('chess.js').Square,
                promotion: oppPromo,
              });
            } catch (err) {
              console.warn('[useScenarioRunner] Bot response chess.move error, using fallback mutation:', err);
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
                console.warn('[useScenarioRunner] Opponent move failed: piece not found at', opp.from);
                oppMoveSuccess = false;
              }
            } else {
              oppMoveSuccess = true;
            }

            if (oppMoveSuccess) {
              currentFen.value = chess.fen();
              lastMove.value = { from: opp.from, to: opp.to };
            }
          } catch (err) {
            console.warn('[useScenarioRunner] Bot response execution failed:', err);
            oppMoveSuccess = false;
          } finally {
            isWaitingForBotResponse.value = false;
            // MAJ-025: Only advance step if move succeeded!
            if (oppMoveSuccess) {
              advanceOrCompleteStep();
            }
          }
        }, delay);
      } else {
        advanceOrCompleteStep();
      }

      return true;
    } catch (err) {
      console.warn('[useScenarioRunner] applyPlayerMove error:', err);
      return false;
    }
  }

  // Unified Board Selection State Machine (MIN-010)
  const boardSelection = useBoardSelection({
    getPieceAt: (sq) => {
      try {
        const piece = chess.get(sq as unknown as import('chess.js').Square);
        if (!piece) return null;
        return { type: piece.type, color: piece.color as 'w' | 'b' };
      } catch (err) {
        console.warn('[useScenarioRunner] getPiece error:', err);
        return null;
      }
    },
    getLegalMovesForSquare: (sq) => getLegalMovesForSquare(sq),
    currentTurn: computed(() => playerColor.value as 'w' | 'b'),
    playerColor: computed(() => playerColor.value as 'w' | 'b'),
    executeMove: (from, to, promotion) => applyPlayerMove({ from, to, promotion }),
  });

  function selectSquare(sq: Square): void {
    if (isWaitingForBotResponse.value || isCompleted.value) return;

    // If square already selected and clicked square is in legal moves
    if (boardSelection.selectedSquare.value && boardSelection.isLegalTarget(sq)) {
      boardSelection.handleSquareClick(sq);
      return;
    }

    // Check if clicked square has a piece belonging to player or is allowed source for tutorial
    try {
      const piece = chess.get(sq as unknown as import('chess.js').Square);
      const isPieceOfPlayer = piece && piece.color === playerColor.value;
      const stepAllowedSource = currentStep.value
        ? isSourceSquareAllowed(currentStep.value, sq, chess)
        : false;

      if (isPieceOfPlayer || stepAllowedSource) {
        boardSelection.handleSquareClick(sq);
        return;
      }
    } catch (err) {
      console.warn('[useScenarioRunner] selectSquare piece check error:', err);
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

  function advanceOrCompleteStep(): void {
    const isLastStep = currentStepIndex.value + 1 >= totalSteps.value;

    nextStepTimer = setTimeout(() => {
      if (isLastStep) {
        isCompleted.value = true;
        const outcome: ScenarioStepOutcomeEvent = {
          type: 'scenario_step_completed',
          starsAwarded: calculatedStars.value,
          isLessonComplete: true,
        };
        lastStepOutcome.value = outcome;
        optionsObj.onStepOutcome?.(outcome);
      } else {
        const outcome: ScenarioStepOutcomeEvent = {
          type: 'scenario_step_completed',
          starsAwarded: calculatedStars.value,
          isLessonComplete: false,
        };
        lastStepOutcome.value = outcome;
        optionsObj.onStepOutcome?.(outcome);
        loadStep(currentStepIndex.value + 1);
      }
    }, 700);
  }

  function revealHint(): void {
    if (!currentStep.value) return;
    hintsUsedCurrentAttempt.value++;
    activeHint.value = currentStep.value.hint;

    // Determine highlight glow squares
    if (currentStep.value.allowedMoves && currentStep.value.allowedMoves.length > 0) {
      hintGlowSquare.value = currentStep.value.allowedMoves[0].from;
      hintTargetSquare.value = currentStep.value.allowedMoves[0].to;
    } else if (currentStep.value.highlightSquares && currentStep.value.highlightSquares.length > 0) {
      hintGlowSquare.value = currentStep.value.highlightSquares[0];
      hintTargetSquare.value = currentStep.value.highlightSquares[1] ?? null;
    }
  }

  function resetCurrentStep(): void {
    loadStep(currentStepIndex.value);
  }

  function nextStep(): void {
    if (currentStepIndex.value + 1 < totalSteps.value) {
      loadStep(currentStepIndex.value + 1);
    } else {
      isCompleted.value = true;
    }
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      clearTimers();
    });
  }

  // Initialize initial scenario step if available
  if (initialScenario) {
    loadStep(0);
  }

  return {
    scenario: readonly(scenario),
    currentStepIndex: readonly(currentStepIndex),
    currentStep,
    currentFen: readonly(currentFen),
    playerColor,
    isMyTurn,
    totalSteps,
    isCompleted: readonly(isCompleted),
    hintsUsedCurrentAttempt: readonly(hintsUsedCurrentAttempt),
    mistakesCurrentAttempt: readonly(mistakesCurrentAttempt),
    activeHint: readonly(activeHint),
    hintGlowSquare: readonly(hintGlowSquare),
    hintTargetSquare: readonly(hintTargetSquare),
    isWaitingForBotResponse: readonly(isWaitingForBotResponse),
    feedbackMessage: readonly(feedbackMessage),
    isStepSuccess: readonly(isStepSuccess),
    isShaking: readonly(isShaking),
    calculatedStars,
    accuracy,
    lastStepOutcome: readonly(lastStepOutcome),
    selectedSquare: computed(() => boardSelection.selectedSquare.value),
    legalMoves: computed(() => boardSelection.legalMovesForSelected.value),
    lastMove: readonly(lastMove),
    pendingPromotion: computed(() => boardSelection.pendingPromotion.value),
    loadScenario,
    loadStep,
    selectSquare,
    applyPlayerMove,
    completePromotion,
    cancelPromotion,
    revealHint,
    resetCurrentStep,
    nextStep,
  };
}
