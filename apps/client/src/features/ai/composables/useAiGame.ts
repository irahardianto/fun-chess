import { ref, computed, onUnmounted } from 'vue';
import { Chess } from 'chess.js';
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
  getMascotPersona,
  getAiConfigForMascot,
} from '../data/index.js';
import { minimaxEngine, hintEngine } from '../engine/index.js';
import { useMascotBanter } from './useMascotBanter.js';
import { useAudio } from '../../../composables/useAudio.js';
import { useConfetti } from '../../../composables/useConfetti.js';

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export interface UseAiGameOptions {
  mascotId?: MascotId;
  playerColor?: PieceColor | 'random';
  initialFen?: string;
  autoStart?: boolean;
}

export function useAiGame(options: UseAiGameOptions = {}) {
  const {
    mascotId: initialMascotId = 'peanut',
    playerColor: initialPlayerColor = 'w',
    initialFen,
    autoStart = true,
  } = options;

  // Audio & Celebrations
  const {
    playMove,
    playCapture,
    playCheck,
    playVictory,
    playDraw,
    playError,
    playClick,
    playStart,
  } = useAudio();
  const { celebrate } = useConfetti();

  // Mascot Persona & Reactive Banter
  const mascot = ref<MascotPersona>(getMascotPersona(initialMascotId));
  const banter = useMascotBanter({ persona: mascot });

  // Chess Rules Engine Instance
  const chess = new Chess(initialFen);

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

  // AI State & Async Operation Control
  const isAiThinking = ref<boolean>(false);
  let activeAiOperationId = 0;
  let matchStartTime = Date.now();

  // Selection & Moves
  const selectedSquare = ref<Square | null>(null);
  const legalMovesForSelected = ref<Square[]>([]);
  const legalMoves = computed<Square[]>(() => legalMovesForSelected.value);
  const pendingPromotion = ref<{ from: Square; to: Square } | null>(null);

  // Captured Pieces & Material
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

  // Calculate Material & Captured Pieces
  function calculateCapturedAndMaterial(): void {
    const startingCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    };

    const board = chess.board();
    const currentCounts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r]?.[c];
        if (piece) {
          currentCounts[piece.color][piece.type]++;
        }
      }
    }

    const whiteCap: PieceType[] = [];
    const blackCap: PieceType[] = [];
    let whiteScore = 0;
    let blackScore = 0;

    (['p', 'n', 'b', 'r', 'q'] as PieceType[]).forEach((type) => {
      const whiteLost = Math.max(0, startingCounts.w[type] - currentCounts.w[type]);
      for (let i = 0; i < whiteLost; i++) {
        whiteCap.push(type);
      }

      const blackLost = Math.max(0, startingCounts.b[type] - currentCounts.b[type]);
      for (let i = 0; i < blackLost; i++) {
        blackCap.push(type);
      }

      whiteScore += currentCounts.w[type] * PIECE_VALUES[type];
      blackScore += currentCounts.b[type] * PIECE_VALUES[type];
    });

    capturedWhite.value = whiteCap;
    capturedBlack.value = blackCap;

    if (whiteScore > blackScore) {
      materialAdvantage.value = { white: whiteScore - blackScore, black: 0 };
    } else if (blackScore > whiteScore) {
      materialAdvantage.value = { white: 0, black: blackScore - whiteScore };
    } else {
      materialAdvantage.value = { white: 0, black: 0 };
    }
  }

  function updateLocalState(): void {
    fen.value = chess.fen();
    turn.value = chess.turn() as PieceColor;
    isCheck.value = chess.inCheck();
    isCheckmate.value = chess.isCheckmate();
    isDraw.value = chess.isDraw();
    isStalemate.value = chess.isStalemate();
    isGameOver.value = chess.isGameOver();
    calculateCapturedAndMaterial();
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
        playVictory();
        celebrate();
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
      playDraw();
    }

    lastGameOver.value = payload;
    return true;
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
        return;
      }

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

      // Trigger SFX
      if (result.captured) {
        playCapture();
      } else {
        playMove();
      }

      // Check for Game Over after AI move
      if (checkAndHandleGameOver()) {
        return;
      }

      // Contextual Dialogue Triggers for AI move
      if (chess.inCheck()) {
        playCheck();
        banter.triggerBanter('ai_check');
      } else if (evaluation.isBlunder) {
        banter.triggerBanter('ai_blunder');
      } else {
        banter.triggerBanter('ai_move');
      }
    } catch {
      // Graceful error recovery
    } finally {
      if (currentOpId === activeAiOperationId) {
        isAiThinking.value = false;
      }
    }
  }

  function getSquarePiece(square: Square): { type: PieceType; color: PieceColor } | null {
    const piece = chess.get(square as unknown as import('chess.js').Square);
    if (!piece) return null;
    return {
      type: piece.type as PieceType,
      color: piece.color as PieceColor,
    };
  }

  function getLegalMoves(square: Square): Square[] {
    const moves = chess.moves({
      square: square as unknown as import('chess.js').Square,
      verbose: true,
    });
    return moves.map((m) => m.to as Square);
  }

  function isPromotionMove(from: Square, to: Square): boolean {
    const piece = getSquarePiece(from);
    if (!piece || piece.type !== 'p') return false;
    const toRank = to.charAt(1);
    return (piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1');
  }

  function clearSelection(): void {
    selectedSquare.value = null;
    legalMovesForSelected.value = [];
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
        playError();
        return false;
      }

      // Commit snapshot to takeback stack
      takebackStack.value.push(snapshot);

      lastMove.value = { from: result.from, to: result.to };
      pendingPromotion.value = null;
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
      clearSelection();
      updateLocalState();

      // Sound Effects
      if (result.captured) {
        playCapture();
      } else {
        playMove();
      }

      // Check Game Over after player move
      if (checkAndHandleGameOver()) {
        return true;
      }

      // Mascot banter reaction
      if (chess.inCheck()) {
        playCheck();
        banter.triggerBanter('player_check');
      } else if (result.captured) {
        banter.triggerBanter('player_move');
      }

      // Schedule AI opponent response
      dispatchAiMove();
      return true;
    } catch {
      playError();
      return false;
    }
  }

  function selectSquare(square: Square): { moved: boolean; requiresPromotion: boolean } {
    if (!isPlayerTurn.value) {
      return { moved: false, requiresPromotion: false };
    }

    // If destination square is clicked while a piece is selected
    if (selectedSquare.value && legalMovesForSelected.value.includes(square)) {
      const from = selectedSquare.value;
      const to = square;

      if (isPromotionMove(from, to)) {
        pendingPromotion.value = { from, to };
        return { moved: false, requiresPromotion: true };
      }

      const moved = applyPlayerMove(from, to);
      return { moved, requiresPromotion: false };
    }

    // Otherwise select the piece on the square if owned by player
    const piece = getSquarePiece(square);
    if (piece && piece.color === playerColor.value) {
      playClick();
      selectedSquare.value = square;
      legalMovesForSelected.value = getLegalMoves(square);
      return { moved: false, requiresPromotion: false };
    }

    clearSelection();
    return { moved: false, requiresPromotion: false };
  }

  function completePromotion(pieceType: 'q' | 'r' | 'b' | 'n'): boolean {
    if (!pendingPromotion.value) return false;
    const { from, to } = pendingPromotion.value;
    const success = applyPlayerMove(from, to, pieceType);
    pendingPromotion.value = null;
    return success;
  }

  function cancelPromotion(): void {
    pendingPromotion.value = null;
    clearSelection();
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
      chess.load(snapshot.fen);
      moveHistory.value = moveHistory.value.slice(0, snapshot.moveCount);
      lastMove.value = moveHistory.value.length > 0
        ? { from: moveHistory.value[moveHistory.value.length - 1]!.from, to: moveHistory.value[moveHistory.value.length - 1]!.to }
        : null;

      pendingPromotion.value = null;
      activeHint.value = null;
      clearSelection();
      updateLocalState();
      isGameOver.value = false;
      lastGameOver.value = null;

      takebackCount.value++;
      playClick();
      banter.triggerBanter('takeback_used');

      return true;
    } catch {
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
      playClick();
      const hint = await hintEngine.calculateHint(chess.fen(), playerColor.value);
      if (hint) {
        activeHint.value = hint;
        hintsCount.value++;
        banter.triggerBanter('hint_requested', hint.explanation);
      }
      return hint;
    } catch {
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
      chess.load(initialFen);
    } else {
      chess.reset();
    }

    moveHistory.value = [];
    takebackStack.value = [];
    takebackCount.value = 0;
    hintsCount.value = 0;
    lastMove.value = null;
    pendingPromotion.value = null;
    activeHint.value = null;
    isGameOver.value = false;
    lastGameOver.value = null;
    matchStartTime = Date.now();

    clearSelection();
    updateLocalState();

    playStart();
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

  onUnmounted(() => {
    activeAiOperationId++;
    isAiThinking.value = false;
  });

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

    // Selection & Moves
    selectedSquare: computed(() => selectedSquare.value),
    legalMoves,
    pendingPromotion: computed(() => pendingPromotion.value),
    selectSquare,
    applyPlayerMove,
    completePromotion,
    cancelPromotion,
    clearSelection,

    // Material & Captured
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
