import { ref, computed, onUnmounted, getCurrentInstance } from 'vue';
import type {
  Square,
  PieceColor,
  PieceType,
  MascotId,
  MascotPersona,
  HintRecommendation,
  TakebackSnapshot,
  GameOverPayload,
  MoveResult,
} from '@fun-chess/shared';
import {
  createSafeChess,
  safeLoadFen,
  calculateMaterialAndCaptures,
} from '@fun-chess/shared';
import {
  getMascotPersona,
  getAiConfigForMascot,
} from '../data/index.js';
import { minimaxEngine, hintEngine } from '../engine/index.js';
import { useMascotBanter } from './useMascotBanter.js';
import { useBoardSelection, type SelectionMoveResult } from '../../board/index.js';

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

export interface UseAiGameOptions {
  mascotId?: MascotId;
  playerColor?: PieceColor | 'random';
  initialFen?: string;
  autoStart?: boolean;
  onMoveOutcome?: (event: MoveOutcomeEvent) => void;
  onGameCompletion?: (event: GameCompletionOutcomeEvent) => void;
}

export function useAiGame(options: UseAiGameOptions = {}) {
  const {
    mascotId: initialMascotId = 'peanut',
    playerColor: initialPlayerColor = 'w',
    initialFen,
    autoStart = true,
  } = options;

  // Mascot Persona & Reactive Banter
  const mascot = ref<MascotPersona>(getMascotPersona(initialMascotId));
  const banter = useMascotBanter({ persona: mascot });

  // Chess Rules Engine Instance
  const chess = createSafeChess(initialFen);

  // Player & Game Configuration
  const rawPlayerColor = ref<PieceColor | 'random'>(initialPlayerColor);
  const playerColor = ref<PieceColor>('w');
  const aiColor = computed<PieceColor>(() => (playerColor.value === 'w' ? 'b' : 'w'));
  const orientation = ref<PieceColor>('w');

  // Board State Refs
  const fen = ref<string>(chess.fen());
  const turn = ref<PieceColor>(chess.turn() as PieceColor);
  const isCheck = ref<boolean>(chess.inCheck());
  const isCheckmate = ref<boolean>(chess.isCheckmate());
  const isDraw = ref<boolean>(chess.isDraw());
  const isStalemate = ref<boolean>(chess.isStalemate());
  const isGameOver = ref<boolean>(chess.isGameOver());
  const moveHistory = ref<MoveResult[]>([]);
  const lastMove = ref<{ from: string; to: string } | null>(null);
  const lastGameOver = ref<GameOverPayload | null>(null);

  // Outcome Events (Decoupled multimedia side effects)
  const lastMoveOutcome = ref<MoveOutcomeEvent | null>(null);
  const lastGameCompletion = ref<GameCompletionOutcomeEvent | null>(null);

  // AI State & Async Operation Control
  const isAiThinking = ref<boolean>(false);
  let activeAiOperationId = 0;
  let matchStartTime = Date.now();

  // Captured Pieces & Material (MIN-009)
  const capturedWhite = ref<PieceType[]>([]);
  const capturedBlack = ref<PieceType[]>([]);
  const materialAdvantage = ref<{ white: number; black: number }>({ white: 0, black: 0 });

  // Takeback / Undo Stack
  const takebackStack = ref<TakebackSnapshot[]>([]);
  const takebackCount = ref<number>(0);

  // Smart Hints
  const activeHint = ref<HintRecommendation | null>(null);
  const hintsCount = ref<number>(0);

  // Turn Checks
  const isPlayerTurn = computed<boolean>(() => {
    return !isGameOver.value && !isAiThinking.value && turn.value === playerColor.value;
  });

  const kingInCheckSquare = computed<Square | null>(() => {
    if (!isCheck.value) return null;
    const board = chess.board();
    const checkedColor = turn.value;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r]?.[c];
        if (piece && piece.type === 'k' && piece.color === checkedColor) {
          return piece.square as Square;
        }
      }
    }
    return null;
  });

  function updateLocalState(): void {
    fen.value = chess.fen();
    turn.value = chess.turn() as PieceColor;
    isCheck.value = chess.inCheck();
    isCheckmate.value = chess.isCheckmate();
    isDraw.value = chess.isDraw();
    isStalemate.value = chess.isStalemate();
    isGameOver.value = chess.isGameOver();

    // Use shared pure evaluation utility (MIN-009)
    const { capturedWhite: cW, capturedBlack: cB, materialAdvantage: mA } =
      calculateMaterialAndCaptures(chess);
    capturedWhite.value = cW;
    capturedBlack.value = cB;
    materialAdvantage.value = mA;
  }

  function captureTakebackSnapshot(): TakebackSnapshot {
    return {
      fen: chess.fen(),
      turn: chess.turn() as PieceColor,
      moveCount: moveHistory.value.length,
      capturedWhite: [...capturedWhite.value],
      capturedBlack: [...capturedBlack.value],
    };
  }

  function resolvePlayerColor(colorOption: PieceColor | 'random'): PieceColor {
    if (colorOption === 'random') {
      return Math.random() < 0.5 ? 'w' : 'b';
    }
    return colorOption;
  }

  function checkAndHandleGameOver(): boolean {
    if (!chess.isGameOver()) return false;

    isGameOver.value = true;
    const durationSeconds = Math.max(1, Math.round((Date.now() - matchStartTime) / 1000));
    const totalMoves = moveHistory.value.length;

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
      reason: payload.reason === 'draw_agreement' ? 'agreement' : (payload.reason as GameCompletionOutcomeEvent['reason']),
      isLocalPlayerWinner: payload.winner === playerColor.value,
    };
    lastGameCompletion.value = completionOutcome;
    options.onGameCompletion?.(completionOutcome);

    return true;
  }

  function applyAiMoveResult(result: import('chess.js').Move, isBlunder = false): void {
    lastMove.value = { from: result.from, to: result.to };

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

    moveHistory.value.push(moveRes);
    updateLocalState();

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
    options.onMoveOutcome?.(moveOutcome);

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

  /**
   * Dispatches the AI turn calculation using Minimax search and blunder generation.
   */
  async function dispatchAiMove(): Promise<void> {
    if (isGameOver.value || chess.turn() !== aiColor.value) {
      return;
    }

    const currentOpId = ++activeAiOperationId;
    isAiThinking.value = true;

    try {
      const config = getAiConfigForMascot(mascot.value.id);
      const evaluation = await minimaxEngine.findBestMove(chess.fen(), config);

      // Check if this operation was superseded by an undo or reset
      if (currentOpId !== activeAiOperationId) {
        return;
      }

      const chosenMove = evaluation.move;
      const result = chess.move({
        from: chosenMove.from as unknown as import('chess.js').Square,
        to: chosenMove.to as unknown as import('chess.js').Square,
        promotion: chosenMove.promotion,
      });

      if (!result) {
        throw new Error(`AI engine generated invalid move: ${JSON.stringify(chosenMove)}`);
      }

      applyAiMoveResult(result, evaluation.isBlunder);
    } catch (err) {
      if (currentOpId !== activeAiOperationId) {
        return;
      }
      console.error('[useAiGame] AI calculation failed, executing emergency fallback move:', err);

      // Emergency fallback legal move (random or first valid move) so game never freezes
      const legalMovesList = chess.moves({ verbose: true });
      if (legalMovesList.length > 0 && !chess.isGameOver()) {
        const fallback = legalMovesList[Math.floor(Math.random() * legalMovesList.length)];
        const fallbackResult = chess.move({
          from: fallback.from,
          to: fallback.to,
          promotion: fallback.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
        });
        if (fallbackResult) {
          applyAiMoveResult(fallbackResult, false);
        }
      }
    } finally {
      if (currentOpId === activeAiOperationId) {
        isAiThinking.value = false;
      }
    }
  }

  function getSquarePiece(square: Square): { type: PieceType; color: PieceColor } | null {
    try {
      const piece = chess.get(square as unknown as import('chess.js').Square);
      if (!piece) return null;
      return {
        type: piece.type as PieceType,
        color: piece.color as PieceColor,
      };
    } catch (err) {
      console.warn('[useAiGame] getSquarePiece error:', err);
      return null;
    }
  }

  function getLegalMoves(square: Square): Square[] {
    try {
      const moves = chess.moves({
        square: square as unknown as import('chess.js').Square,
        verbose: true,
      });
      return moves.map((m) => m.to as Square);
    } catch (err) {
      console.warn('[useAiGame] getLegalMoves error:', err);
      return [];
    }
  }

  /**
   * Executes a verified player move on the board and dispatches AI reply.
   */
  function applyPlayerMove(
    from: Square,
    to: Square,
    promotion?: 'q' | 'r' | 'b' | 'n',
  ): boolean {
    if (!isPlayerTurn.value) return false;

    // Snapshot board state prior to human move for Takeback / Undo
    const snapshot = captureTakebackSnapshot();

    try {
      const result = chess.move({
        from: from as unknown as import('chess.js').Square,
        to: to as unknown as import('chess.js').Square,
        promotion,
      });

      if (!result) {
        console.warn('[useAiGame] Invalid player move:', { from, to, promotion });
        return false;
      }

      // Commit snapshot to takeback stack
      takebackStack.value.push(snapshot);

      lastMove.value = { from: result.from, to: result.to };
      activeHint.value = null; // Clear active hint on move

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

      moveHistory.value.push(moveRes);
      boardSelection.clearSelection();
      updateLocalState();

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
      options.onMoveOutcome?.(outcomeEvent);

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
      console.warn('[useAiGame] applyPlayerMove error:', err);
      return false;
    }
  }

  // Unified Board Selection State Machine (MIN-010)
  const boardSelection = useBoardSelection({
    getPieceAt: (sq) => getSquarePiece(sq),
    getLegalMovesForSquare: (sq) => getLegalMoves(sq),
    currentTurn: turn,
    playerColor,
    executeMove: (from, to, promotion) => applyPlayerMove(from, to, promotion),
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
  function takeback(): boolean {
    if (takebackStack.value.length === 0) return false;

    // Abort pending AI search
    activeAiOperationId++;
    isAiThinking.value = false;

    const snapshot = takebackStack.value.pop();
    if (!snapshot) return false;

    try {
      safeLoadFen(chess, snapshot.fen);
      moveHistory.value = moveHistory.value.slice(0, snapshot.moveCount);
      lastMove.value = moveHistory.value.length > 0
        ? { from: moveHistory.value[moveHistory.value.length - 1]!.from, to: moveHistory.value[moveHistory.value.length - 1]!.to }
        : null;

      boardSelection.clearSelection();
      activeHint.value = null;
      updateLocalState();
      isGameOver.value = false;
      lastGameOver.value = null;

      takebackCount.value++;
      banter.triggerBanter('takeback_used');

      return true;
    } catch (err) {
      console.warn('[useAiGame] takeback failed:', err);
      return false;
    }
  }

  /**
   * Computes a smart contextual hint with highlighted squares and explanation.
   */
  async function askForHint(): Promise<HintRecommendation | null> {
    if (!isPlayerTurn.value || isGameOver.value) {
      return null;
    }

    try {
      const hint = await hintEngine.calculateHint(chess.fen(), playerColor.value);
      if (hint) {
        activeHint.value = hint;
        hintsCount.value++;
        banter.triggerBanter('hint_requested', hint.explanation);
      }
      return hint;
    } catch (err) {
      console.warn('[useAiGame] askForHint failed:', err);
      return null;
    }
  }

  function clearHint(): void {
    activeHint.value = null;
  }

  function flipBoard(): void {
    orientation.value = orientation.value === 'w' ? 'b' : 'w';
  }

  function resign(): void {
    if (isGameOver.value) return;

    activeAiOperationId++;
    isAiThinking.value = false;
    isGameOver.value = true;

    const durationSeconds = Math.max(1, Math.round((Date.now() - matchStartTime) / 1000));
    const payload: GameOverPayload = {
      winner: aiColor.value,
      winnerName: mascot.value.name,
      reason: 'resignation',
      message: `You resigned. ${mascot.value.name} won! 🏳️`,
      finalFen: chess.fen(),
      totalMoves: moveHistory.value.length,
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
    options.onGameCompletion?.(completionOutcome);
  }

  /**
   * Initializes or restarts a match with optional mascot persona or player color changes.
   */
  function startNewGame(
    newMascotId?: MascotId,
    newPlayerColor?: PieceColor | 'random',
  ): void {
    activeAiOperationId++;
    isAiThinking.value = false;

    if (newMascotId) {
      mascot.value = getMascotPersona(newMascotId);
      banter.setPersona(mascot.value);
    }

    if (newPlayerColor !== undefined) {
      rawPlayerColor.value = newPlayerColor;
    }

    playerColor.value = resolvePlayerColor(rawPlayerColor.value);
    orientation.value = playerColor.value;

    if (initialFen) {
      safeLoadFen(chess, initialFen);
    } else {
      chess.reset();
    }

    moveHistory.value = [];
    takebackStack.value = [];
    takebackCount.value = 0;
    hintsCount.value = 0;
    lastMove.value = null;
    activeHint.value = null;
    isGameOver.value = false;
    lastGameOver.value = null;
    lastMoveOutcome.value = null;
    lastGameCompletion.value = null;
    matchStartTime = Date.now();

    boardSelection.clearSelection();
    updateLocalState();

    banter.triggerBanter('game_start');

    // If player is Black, AI moves first as White
    if (playerColor.value === 'b') {
      dispatchAiMove();
    }
  }

  // Initialize
  playerColor.value = resolvePlayerColor(rawPlayerColor.value);
  orientation.value = playerColor.value;
  updateLocalState();

  if (autoStart) {
    banter.triggerBanter('game_start');
    if (playerColor.value === 'b') {
      dispatchAiMove();
    }
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      activeAiOperationId++;
      isAiThinking.value = false;
    });
  }

  return {
    // Mascot & Dialogue
    mascot: computed(() => mascot.value),
    activeMascotDialogue: banter.activeDialogue,
    isMascotSpeaking: banter.isSpeaking,
    triggerBanter: banter.triggerBanter,

    // Core Chess State
    chess,
    fen: computed(() => fen.value),
    turn: computed(() => turn.value),
    orientation: computed(() => orientation.value),
    playerColor: computed(() => playerColor.value),
    aiColor,
    isPlayerTurn,
    isAiThinking: computed(() => isAiThinking.value),
    isCheck: computed(() => isCheck.value),
    isCheckmate: computed(() => isCheckmate.value),
    isDraw: computed(() => isDraw.value),
    isStalemate: computed(() => isStalemate.value),
    isGameOver: computed(() => isGameOver.value),
    lastGameOver: computed(() => lastGameOver.value),
    moveHistory: computed(() => moveHistory.value),
    lastMove: computed(() => lastMove.value),
    kingInCheckSquare,

    // Decoupled Outcome Events (MAJ-009)
    lastMoveOutcome: computed(() => lastMoveOutcome.value),
    lastGameCompletion: computed(() => lastGameCompletion.value),

    // Selection & Moves (MIN-010 via useBoardSelection)
    selectedSquare: computed(() => boardSelection.selectedSquare.value),
    legalMoves: computed(() => boardSelection.legalMovesForSelected.value),
    legalMovesForSelected: computed(() => boardSelection.legalMovesForSelected.value),
    pendingPromotion: computed(() => boardSelection.pendingPromotion.value),
    selectSquare,
    applyPlayerMove,
    completePromotion: (piece: 'q' | 'r' | 'b' | 'n') => boardSelection.completePromotion(piece),
    cancelPromotion: () => boardSelection.cancelPromotion(),
    clearSelection: () => boardSelection.clearSelection(),

    // Material & Captured (MIN-009)
    capturedWhite: computed(() => capturedWhite.value),
    capturedBlack: computed(() => capturedBlack.value),
    materialAdvantage: computed(() => materialAdvantage.value),

    // Learning Tools (Takeback & Hint)
    takebackStack: computed(() => takebackStack.value),
    takebackCount: computed(() => takebackCount.value),
    canTakeback: computed(() => takebackStack.value.length > 0 && !isAiThinking.value),
    takeback,

    activeHint: computed(() => activeHint.value),
    hintsCount: computed(() => hintsCount.value),
    canAskHint: computed(() => isPlayerTurn.value && !isGameOver.value),
    askForHint,
    clearHint,

    // Game Actions
    startNewGame,
    flipBoard,
    resign,
  };
}
