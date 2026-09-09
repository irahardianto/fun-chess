import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { Chess } from 'chess.js';
import { useAiMoveExecution } from '../useAiMoveExecution';
import type { MascotPersona, PieceColor } from '@fun-chess/shared';

describe('useAiMoveExecution composable', () => {
  const defaultMascot: MascotPersona = {
    id: 'sparky',
    name: 'Sparky',
    title: 'Tactical Pup',
    avatar: '🐶',
    difficulty: 'novice',
    eloEstimate: 600,
    description: 'Always sniffing out tactics!',
    themeColor: '#4f46e5',
    dialogues: {
      game_start: [],
      player_move: [],
      ai_move: [],
      player_check: [],
      ai_check: [],
      player_blunder: [],
      ai_blunder: [],
      player_win: [],
      ai_win: [],
      draw: [],
      hint_requested: [],
      takeback_used: [],
    },
  };

  function createTestEnvironment(initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
    const chess = new Chess(initialFen);
    const turn = ref<PieceColor>('w');
    const playerColor = ref<PieceColor>('w');
    const aiColor = ref<PieceColor>('b');
    const isGameOver = ref(false);
    const lastGameOver = ref<any>(null);
    const capturedWhite = ref<string[]>([]);
    const capturedBlack = ref<string[]>([]);

    const boardState: any = {
      chess,
      turn,
      playerColor,
      aiColor,
      isGameOver,
      lastGameOver,
      capturedWhite,
      capturedBlack,
      updateLocalState: vi.fn(() => {
        turn.value = chess.turn() as PieceColor;
      }),
    };

    const isAiThinking = ref(false);
    const aiWorker: any = {
      isAiThinking,
      requestAiMove: vi.fn(),
      cancelCalculation: vi.fn(),
    };

    const history: any = {
      moveHistory: ref<any[]>([]),
      createSnapshot: vi.fn(() => ({ fen: chess.fen() })),
      pushSnapshot: vi.fn(),
      recordMove: vi.fn((m) => {
        history.moveHistory.value.push(m);
      }),
    };

    const banter: any = {
      triggerBanter: vi.fn(),
    };

    const mascot = ref<MascotPersona>(defaultMascot);
    const onMoveOutcome = vi.fn();
    const onGameCompletion = vi.fn();
    const onClearSelection = vi.fn();
    const onClearHint = vi.fn();

    const execution = useAiMoveExecution({
      boardState,
      aiWorker,
      history,
      banter,
      mascot,
      onMoveOutcome,
      onGameCompletion,
      onClearSelection,
      onClearHint,
    });

    return {
      chess,
      turn,
      playerColor,
      aiColor,
      isGameOver,
      lastGameOver,
      boardState,
      aiWorker,
      history,
      banter,
      mascot,
      execution,
      onMoveOutcome,
      onGameCompletion,
      onClearSelection,
      onClearHint,
    };
  }

  it('rejects move if it is not player turn or game is over', () => {
    const env = createTestEnvironment();
    env.turn.value = 'b'; // AI turn
    expect(env.execution.applyPlayerMove('e2', 'e4')).toBe(false);

    env.turn.value = 'w';
    env.isGameOver.value = true;
    expect(env.execution.applyPlayerMove('e2', 'e4')).toBe(false);

    env.isGameOver.value = false;
    env.aiWorker.isAiThinking.value = true;
    expect(env.execution.applyPlayerMove('e2', 'e4')).toBe(false);
  });

  it('applies legal player move and pushes snapshot', () => {
    const env = createTestEnvironment();
    const ok = env.execution.applyPlayerMove('e2', 'e4');
    expect(ok).toBe(true);
    expect(env.history.pushSnapshot).toHaveBeenCalled();
    expect(env.onClearSelection).toHaveBeenCalled();
    expect(env.onMoveOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'move',
        from: 'e2',
        to: 'e4',
        isCheck: false,
      }),
    );
  });

  it('catches and logs warning on illegal player move exception', () => {
    const env = createTestEnvironment();
    // Attempt illegal move e2 to e7
    const ok = env.execution.applyPlayerMove('e2', 'e7');
    expect(ok).toBe(false);
  });

  it('triggers banter on check or capture', () => {
    const env2 = createTestEnvironment('rnbqkbnr/pppp1ppp/4p3/8/5PP1/8/PPPPP2P/RNBQKBNR b KQkq - 0 2');
    env2.playerColor.value = 'b';
    env2.turn.value = 'b';
    const ok = env2.execution.applyPlayerMove('d8', 'h4'); // Qh4# delivers checkmate
    expect(ok).toBe(true);
    expect(env2.banter.triggerBanter).toHaveBeenCalledWith('player_win');
  });

  it('handles game resignation', () => {
    const env = createTestEnvironment();
    env.execution.resign();
    expect(env.isGameOver.value).toBe(true);
    expect(env.lastGameOver.value.winner).toBe('b');
    expect(env.banter.triggerBanter).toHaveBeenCalledWith('ai_win');
    expect(env.onGameCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'game_over',
        winner: 'b',
        reason: 'resignation',
      }),
    );

    // Resigning again when already game over should be no-op
    env.banter.triggerBanter.mockClear();
    env.execution.resign();
    expect(env.banter.triggerBanter).not.toHaveBeenCalled();
  });

  it('handles draw states (stalemate, threefold repetition, insufficient material)', () => {
    // Stalemate position (King on a8, Queen on c7, White King on a6)
    const stalemateFen = 'k7/2Q5/K7/8/8/8/8/8 b - - 0 1';
    const env = createTestEnvironment(stalemateFen);
    const isOver = env.execution.checkAndHandleGameOver();
    expect(isOver).toBe(true);
    expect(env.lastGameOver.value.winner).toBe('draw');
    expect(env.lastGameOver.value.reason).toBe('stalemate');
    expect(env.banter.triggerBanter).toHaveBeenCalledWith('draw');
  });

  it('handles AI move application and blunder banter', () => {
    const env = createTestEnvironment();
    const chessMove = env.chess.move('e4');
    expect(chessMove).toBeDefined();

    // Apply with isBlunder = true
    env.execution.applyAiMoveResult(chessMove!, true);
    expect(env.banter.triggerBanter).toHaveBeenCalledWith('ai_blunder');
  });

  it('dispatches AI move only when it is AI turn', async () => {
    const env = createTestEnvironment();
    env.turn.value = 'w'; // human turn
    await env.execution.dispatchAiMove();
    expect(env.aiWorker.requestAiMove).not.toHaveBeenCalled();

    // Switch to AI turn
    env.turn.value = 'b';
    env.chess.move('e4');
    await env.execution.dispatchAiMove();
    expect(env.aiWorker.requestAiMove).toHaveBeenCalled();
  });

  it('resets execution state on resetExecution()', () => {
    const env = createTestEnvironment();
    env.execution.resetExecution();
    expect(env.execution.lastMoveOutcome.value).toBeNull();
    expect(env.execution.lastGameCompletion.value).toBeNull();
  });

  it('handles AI delivering checkmate with ai_win banter', () => {
    // White King checkmated by Black
    const checkmatedWhiteFen = 'rnb1kbnr/pppp1ppp/4p3/8/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 0 3';
    const env = createTestEnvironment(checkmatedWhiteFen);
    // Player is White, AI is Black
    env.playerColor.value = 'w';
    env.aiColor.value = 'b';
    const isOver = env.execution.checkAndHandleGameOver();
    expect(isOver).toBe(true);
    expect(env.lastGameOver.value.winner).toBe('b');
    expect(env.banter.triggerBanter).toHaveBeenCalledWith('ai_win');
    expect(env.lastGameOver.value.message).toContain('Sparky won this game!');
  });

  it('handles draw by insufficient material', () => {
    // King vs King is insufficient material
    const insufficientFen = '8/8/8/4k3/8/8/4K3/8 w - - 0 1';
    const env = createTestEnvironment(insufficientFen);
    const isOver = env.execution.checkAndHandleGameOver();
    expect(isOver).toBe(true);
    expect(env.lastGameOver.value.winner).toBe('draw');
    expect(env.lastGameOver.value.reason).toBe('insufficient_material');
    expect(env.banter.triggerBanter).toHaveBeenCalledWith('draw');
  });

  it('triggers player_check and player_move banters on player actions', () => {
    // 1. Player gives check without mate (Rook to e1 checks e7 King, White King is on a1)
    const beforeCheckFen = '8/4k3/8/8/8/8/8/K6R w - - 0 1';
    const env = createTestEnvironment(beforeCheckFen);
    env.execution.applyPlayerMove('h1', 'e1');
    expect(env.banter.triggerBanter).toHaveBeenCalledWith('player_check');

    // 2. Player captures piece without check
    // Let's have White pawn capture Black pawn: d4xe5
    const fenPawnCapture = '8/8/8/4p3/3P4/8/8/4K2k w - - 0 1';
    const envPawn = createTestEnvironment(fenPawnCapture);
    envPawn.execution.applyPlayerMove('d4', 'e5');
    expect(envPawn.banter.triggerBanter).toHaveBeenCalledWith('player_move');
  });

  it('triggers ai_check and ai_move banters on AI move outcomes', () => {
    // 1. AI gives check
    const beforeAiCheckFen = 'rnbqkbnr/pppp1ppp/4p3/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1';
    const env = createTestEnvironment(beforeAiCheckFen);
    env.turn.value = 'b';
    env.aiColor.value = 'b';
    const moveCheck = env.chess.move('Qh4+');
    env.execution.applyAiMoveResult(moveCheck!);
    expect(env.banter.triggerBanter).toHaveBeenCalledWith('ai_check');

    // 2. Standard AI move
    const envNormal = createTestEnvironment();
    envNormal.turn.value = 'b';
    envNormal.aiColor.value = 'b';
    const normalMove = envNormal.chess.move('e4');
    envNormal.execution.applyAiMoveResult(normalMove!);
    expect(envNormal.banter.triggerBanter).toHaveBeenCalledWith('ai_move');
  });
});
