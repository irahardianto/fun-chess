import { ref, computed, readonly, onUnmounted, getCurrentInstance } from 'vue';
import type {
  Square,
  PieceColor,
  PieceType,
  TutorialStep,
  ChessScenario,
  StarRating,
} from '@fun-chess/shared';
import { createSafeChess, safeLoadFen } from '@fun-chess/shared';
import { validateStepMove } from '../engine/scenario_validator';
import { calculateStars, calculateAccuracy } from '../engine/star_calculator';
import { useAudio } from '../../../composables/useAudio';

export interface UseScenarioRunnerOptions {
  scenario?: ChessScenario | null;
  autoPlayAudio?: boolean;
}

export function useScenarioRunner(options?: UseScenarioRunnerOptions | ChessScenario) {
  const initialScenario =
    options && 'steps' in options
      ? options
      : options?.scenario ?? null;

  const autoAudio =
    options && 'steps' in options
      ? true
      : options?.autoPlayAudio ?? true;

  const audio = useAudio();

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

  const selectedSquare = ref<Square | null>(null);
  const legalMoves = ref<Square[]>([]);
  const lastMove = ref<{ from: string; to: string } | null>(null);
  const pendingPromotion = ref<{ from: Square; to: Square } | null>(null);

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
    } catch {
      currentFen.value = fenStr;
    }
  }

  function getLegalMovesForSquare(sq: Square): Square[] {
    const step = currentStep.value;
    if (step && step.allowedMoves && step.allowedMoves.length > 0) {
      const stepTargets = step.allowedMoves
        .filter((c) => c.from === sq)
        .map((c) => c.to);
      if (stepTargets.length > 0) {
        return stepTargets;
      }
    }

    try {
      const moves = chess.moves({
        square: sq as unknown as import('chess.js').Square,
        verbose: true,
      });
      return moves.map((m) => m.to as Square);
    } catch {
      return [];
    }
  }

  function isPromotionMove(from: Square, to: Square): boolean {
    try {
      const piece = chess.get(from as unknown as import('chess.js').Square);
      if (!piece || piece.type !== 'p') return false;
      const toRank = to.charAt(1);
      return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
    } catch {
      return false;
    }
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
    selectedSquare.value = null;
    legalMoves.value = [];
    lastMove.value = null;
    pendingPromotion.value = null;
  }

  function loadScenario(newScenario: ChessScenario, initialStepIdx = 0): void {
    clearTimers();
    scenario.value = newScenario;
    hintsUsedCurrentAttempt.value = 0;
    mistakesCurrentAttempt.value = 0;
    isCompleted.value = false;
    loadStep(initialStepIdx);
  }

  function selectSquare(sq: Square): void {
    if (isWaitingForBotResponse.value || isCompleted.value) return;

    // If square already selected and clicked square is in legal moves
    if (selectedSquare.value && legalMoves.value.includes(sq)) {
      const from = selectedSquare.value;
      const to = sq;

      if (isPromotionMove(from, to)) {
        pendingPromotion.value = { from, to };
        return;
      }

      applyPlayerMove({ from, to });
      return;
    }

    // Check if clicked square has a piece belonging to player
    try {
      const piece = chess.get(sq as unknown as import('chess.js').Square);
      const isPieceOfPlayer = piece && piece.color === playerColor.value;
      const stepAllowedSource = currentStep.value?.allowedMoves?.some((c) => c.from === sq);

      if (isPieceOfPlayer || stepAllowedSource) {
        selectedSquare.value = sq;
        legalMoves.value = getLegalMovesForSquare(sq);
        if (autoAudio) audio.playPickup();
        return;
      }
    } catch {
      // Fallback
    }

    // Deselect if empty or invalid
    selectedSquare.value = null;
    legalMoves.value = [];
  }

  function applyPlayerMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }): boolean {
    if (!currentStep.value || isWaitingForBotResponse.value || isCompleted.value) {
      return false;
    }

    const step = currentStep.value;
    const isValidForStep = validateStepMove(step, move);

    if (!isValidForStep) {
      // Wrong move attempted! Non-punitive feedback
      mistakesCurrentAttempt.value++;
      isShaking.value = true;
      feedbackMessage.value = 'Not quite! Look for the goal square or tap 💡 Hint for a clue.';
      if (autoAudio) audio.playError();

      if (shakeTimer) clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => {
        isShaking.value = false;
      }, 400);

      selectedSquare.value = null;
      legalMoves.value = [];
      return false;
    }

    // Move is valid for this tutorial step! Execute move
    try {
      const promoChar = move.promotion ? (move.promotion.toLowerCase() as 'q' | 'r' | 'b' | 'n') : 'q';
      const isPromo = isPromotionMove(move.from, move.to);
      let res: any = null;

      try {
        res = chess.move({
          from: move.from as unknown as import('chess.js').Square,
          to: move.to as unknown as import('chess.js').Square,
          promotion: isPromo ? promoChar : undefined,
        });
      } catch {
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
      feedbackMessage.value = step.explanationOnSuccess;
      selectedSquare.value = null;
      legalMoves.value = [];
      pendingPromotion.value = null;

      // Play audio
      if (autoAudio) {
        if (chess.isCheckmate() || chess.inCheck()) {
          audio.playCheck();
        } else if (res?.captured) {
          audio.playCapture();
        } else {
          audio.playMove();
        }
      }

      // Check if there is an automated opponent response
      if (step.opponentResponse) {
        const opp = step.opponentResponse;
        isWaitingForBotResponse.value = true;
        const delay = opp.delayMs ?? 500;

        botTimer = setTimeout(() => {
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
            } catch {
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
              }
            }

            currentFen.value = chess.fen();
            lastMove.value = { from: opp.from, to: opp.to };
            if (autoAudio) {
              if (oppRes?.captured) audio.playCapture();
              else audio.playMove();
            }
          } catch {
            // Ignore
          } finally {
            isWaitingForBotResponse.value = false;
            advanceOrCompleteStep();
          }
        }, delay);
      } else {
        advanceOrCompleteStep();
      }

      return true;
    } catch {
      return false;
    }
  }

  function completePromotion(pieceType: 'q' | 'r' | 'b' | 'n'): boolean {
    if (!pendingPromotion.value) return false;
    const { from, to } = pendingPromotion.value;
    return applyPlayerMove({ from, to, promotion: pieceType });
  }

  function cancelPromotion(): void {
    pendingPromotion.value = null;
    selectedSquare.value = null;
    legalMoves.value = [];
  }

  function advanceOrCompleteStep(): void {
    const isLastStep = currentStepIndex.value + 1 >= totalSteps.value;

    nextStepTimer = setTimeout(() => {
      if (isLastStep) {
        isCompleted.value = true;
        if (autoAudio) audio.playVictory();
      } else {
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

    if (autoAudio) audio.playClick();
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
    selectedSquare: readonly(selectedSquare),
    legalMoves: readonly(legalMoves),
    lastMove: readonly(lastMove),
    pendingPromotion: readonly(pendingPromotion),
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
