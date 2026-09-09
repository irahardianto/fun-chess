import { ref, computed, getCurrentInstance } from 'vue';
import type {
  Square,
  PieceColor,
  MascotId,
  MascotPersona,
  HintRecommendation,
} from '@fun-chess/shared';
import { safeLoadFen } from '@fun-chess/shared';
import { useInjectLogger } from '@/platform/di';
import { logger as defaultLogger, generateCorrelationId, type ILogger } from '@/platform/telemetry/index.js';
import { getMascotPersona } from '../data/index.js';
import { hintEngine } from '../engine/index.js';
import { useMascotBanter } from './useMascotBanter.js';
import { useAiWorker } from './useAiWorker.js';
import { useTakebackHistory } from './useTakebackHistory.js';
import { useAiBoardState } from './useAiBoardState.js';
import {
  useAiMoveExecution,
  type MoveOutcomeEvent,
  type GameCompletionOutcomeEvent,
} from './useAiMoveExecution.js';
import { useBoardSelection, type SelectionMoveResult } from '../../board/index.js';

export type { MoveOutcomeEvent, GameCompletionOutcomeEvent };

export interface UseAiGameOptions {
  mascotId?: MascotId;
  playerColor?: PieceColor | 'random';
  initialFen?: string;
  autoStart?: boolean;
  onMoveOutcome?: (event: MoveOutcomeEvent) => void;
  onGameCompletion?: (event: GameCompletionOutcomeEvent) => void;
  logger?: ILogger;
}

/**
 * useAiGame composable (MAJ-041, MIN-023).
 * Decomposed orchestrator wiring AI worker execution, move history / takebacks,
 * board selection state machine, board state, move execution, and mascot dialogue banter.
 */
export function useAiGame(options: UseAiGameOptions = {}) {
  const logger = options.logger ?? (getCurrentInstance() ? useInjectLogger() : defaultLogger);
  const {
    mascotId: initialMascotId = 'peanut',
    playerColor: initialPlayerColor = 'w',
    initialFen,
    autoStart = true,
    onMoveOutcome,
    onGameCompletion,
  } = options;

  // 1. Mascot Persona & Reactive Banter
  const mascot = ref<MascotPersona>(getMascotPersona(initialMascotId));
  const banter = useMascotBanter({ persona: mascot });

  // 2. Sub-composable: AI Board State (MIN-023)
  const boardState = useAiBoardState({
    initialFen,
    initialPlayerColor,
  });
  const {
    chess,
    playerColor,
    aiColor,
    isGameOver,
    kingInCheckSquare,
  } = boardState;

  // 3. Sub-composable: AI Worker Execution (MAJ-041)
  const aiWorker = useAiWorker({ logger });
  const { isAiThinking, cancelCalculation } = aiWorker;

  // 4. Sub-composable: Move History & Takeback Stack (MAJ-041)
  const history = useTakebackHistory({
    isAiThinking,
  });
  const {
    takebackStack,
    takebackCount,
    moveHistory,
    lastMove,
    canTakeback,
  } = history;

  // 5. Smart Hints
  const activeHint = ref<HintRecommendation | null>(null);
  const hintsCount = ref<number>(0);

  // Turn Checks
  const isPlayerTurn = computed<boolean>(() => {
    return !isGameOver.value && !isAiThinking.value && boardState.turn.value === playerColor.value;
  });

  // 6. Sub-composable: AI Move Execution & Lifecycle (MIN-023)
  const moveExecution = useAiMoveExecution({
    boardState,
    aiWorker,
    history,
    banter,
    mascot,
    onMoveOutcome,
    onGameCompletion,
    onClearSelection: () => boardSelection.clearSelection(),
    onClearHint: () => {
      activeHint.value = null;
    },
    logger,
  });

  // 7. Unified Board Selection State Machine (MIN-010 via useBoardSelection)
  const boardSelection = useBoardSelection({
    getPieceAt: (sq) => boardState.getSquarePiece(sq),
    getLegalMovesForSquare: (sq) => boardState.getLegalMoves(sq),
    currentTurn: boardState.turn,
    playerColor,
    executeMove: (from, to, promotion) => moveExecution.applyPlayerMove(from, to, promotion),
  });

  function selectSquare(square: Square): SelectionMoveResult {
    if (!isPlayerTurn.value) {
      return { moved: false, requiresPromotion: false };
    }
    return boardSelection.handleSquareClick(square);
  }

  /**
   * Instant unlimited takeback / undo.
   * Reverts board state back to before the player's last move.
   */
  function handleTakeback(): boolean {
    if (takebackStack.value.length === 0) return false;

    const correlationId = generateCorrelationId();
    const startTime = performance.now();

    logger.info('Starting takeback', {
      operation: 'takeback',
      correlationId,
    });

    // Abort pending AI search
    cancelCalculation();

    const snapshot = history.popSnapshot();
    if (!snapshot) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Takeback failed', {
        operation: 'takeback',
        correlationId,
        status: 'failed',
        duration: durationMs,
        durationMs,
        error: 'No takeback snapshot available',
      });
      return false;
    }

    try {
      safeLoadFen(chess, snapshot.fen);
      history.rewindTo(snapshot);

      boardSelection.clearSelection();
      activeHint.value = null;
      boardState.updateLocalState();
      boardState.isGameOver.value = false;
      boardState.lastGameOver.value = null;

      banter.triggerBanter('takeback_used');

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('Takeback completed successfully', {
        operation: 'takeback',
        correlationId,
        status: 'success',
        duration: durationMs,
        durationMs,
      });
      return true;
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('Takeback failed', {
        operation: 'takeback',
        correlationId,
        status: 'failed',
        duration: durationMs,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  const takeback = handleTakeback;

  /**
   * Computes a smart contextual hint with highlighted squares and explanation.
   */
  async function askForHint(): Promise<HintRecommendation | null> {
    if (!isPlayerTurn.value || isGameOver.value) {
      return null;
    }

    const correlationId = generateCorrelationId();
    const startTime = performance.now();

    logger.info('Starting askForHint', {
      operation: 'ask_for_hint',
      correlationId,
    });

    try {
      const hint = await hintEngine.calculateHint(chess.fen(), playerColor.value);
      if (hint) {
        activeHint.value = hint;
        hintsCount.value++;
        banter.triggerBanter('hint_requested', hint.explanation);
      }

      const durationMs = Math.round(performance.now() - startTime);
      logger.info('askForHint completed successfully', {
        operation: 'ask_for_hint',
        correlationId,
        status: 'success',
        duration: durationMs,
        durationMs,
      });
      return hint;
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.error('askForHint failed', {
        operation: 'ask_for_hint',
        correlationId,
        status: 'failed',
        duration: durationMs,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  function clearHint(): void {
    activeHint.value = null;
  }

  /**
   * Initializes or restarts a match with optional mascot persona or player color changes.
   */
  function startNewGame(
    newMascotId?: MascotId,
    newPlayerColor?: PieceColor | 'random'
  ): void {
    cancelCalculation();

    if (newMascotId) {
      mascot.value = getMascotPersona(newMascotId);
      banter.setPersona(mascot.value);
    }

    boardState.initPlayerColor(newPlayerColor);
    boardState.resetBoard(initialFen);

    history.resetHistory();
    moveExecution.resetExecution();
    hintsCount.value = 0;
    activeHint.value = null;

    boardSelection.clearSelection();
    banter.triggerBanter('game_start');

    // If player is Black, AI moves first as White
    if (playerColor.value === 'b') {
      moveExecution.dispatchAiMove();
    }
  }

  // Auto-start game triggers
  if (autoStart) {
    banter.triggerBanter('game_start');
    if (playerColor.value === 'b') {
      moveExecution.dispatchAiMove();
    }
  }

  return {
    // Mascot & Dialogue
    mascot: computed(() => mascot.value),
    activeMascotDialogue: banter.activeDialogue,
    isMascotSpeaking: banter.isSpeaking,
    triggerBanter: banter.triggerBanter,

    // Core Chess State
    chess,
    fen: computed(() => boardState.fen.value),
    turn: computed(() => boardState.turn.value),
    orientation: computed(() => boardState.orientation.value),
    playerColor: computed(() => boardState.playerColor.value),
    aiColor,
    isPlayerTurn,
    isAiThinking,
    isCheck: computed(() => boardState.isCheck.value),
    isCheckmate: computed(() => boardState.isCheckmate.value),
    isDraw: computed(() => boardState.isDraw.value),
    isStalemate: computed(() => boardState.isStalemate.value),
    isGameOver: computed(() => boardState.isGameOver.value),
    lastGameOver: computed(() => boardState.lastGameOver.value),
    moveHistory: computed(() => moveHistory.value),
    lastMove: computed(() => lastMove.value),
    kingInCheckSquare,

    // Decoupled Outcome Events (MAJ-009)
    lastMoveOutcome: computed(() => moveExecution.lastMoveOutcome.value),
    lastGameCompletion: computed(() => moveExecution.lastGameCompletion.value),

    // Selection & Moves (MIN-010 via useBoardSelection)
    selectedSquare: computed(() => boardSelection.selectedSquare.value),
    legalMoves: computed(() => boardSelection.legalMovesForSelected.value),
    legalMovesForSelected: computed(() => boardSelection.legalMovesForSelected.value),
    pendingPromotion: computed(() => boardSelection.pendingPromotion.value),
    selectSquare,
    applyPlayerMove: moveExecution.applyPlayerMove,
    completePromotion: (piece: 'q' | 'r' | 'b' | 'n') => boardSelection.completePromotion(piece),
    cancelPromotion: () => boardSelection.cancelPromotion(),
    clearSelection: () => boardSelection.clearSelection(),

    // Material & Captured (MIN-009)
    capturedWhite: computed(() => boardState.capturedWhite.value),
    capturedBlack: computed(() => boardState.capturedBlack.value),
    materialAdvantage: computed(() => boardState.materialAdvantage.value),

    // Learning Tools (Takeback & Hint)
    takebackStack: computed(() => takebackStack.value),
    takebackCount: computed(() => takebackCount.value),
    canTakeback,
    takeback,

    activeHint: computed(() => activeHint.value),
    hintsCount: computed(() => hintsCount.value),
    canAskHint: computed(() => isPlayerTurn.value && !isGameOver.value),
    askForHint,
    clearHint,

    // Game Actions
    startNewGame,
    flipBoard: boardState.flipBoard,
    resign: moveExecution.resign,
  };
}
