import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useTakebackHistory } from '../useTakebackHistory';
import type { MoveResult } from '@fun-chess/shared';

function createMockMove(partial: Partial<MoveResult> & { from: string; to: string; san: string; piece: 'p' | 'r' | 'n' | 'b' | 'q' | 'k'; color: 'w' | 'b' }): MoveResult {
  return {
    flags: 'n',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moveNumber: 1,
    timestamp: 1700000000000,
    ...partial,
  };
}

describe('useTakebackHistory composable', () => {
  it('should initialize with default clean history state', () => {
    const {
      takebackStack,
      takebackCount,
      moveHistory,
      lastMove,
      canTakeback,
    } = useTakebackHistory();

    expect(takebackStack.value).toEqual([]);
    expect(takebackCount.value).toBe(0);
    expect(moveHistory.value).toEqual([]);
    expect(lastMove.value).toBeNull();
    expect(canTakeback.value).toBe(false);
  });

  it('should create and push snapshots, enabling canTakeback', () => {
    const isThinking = ref(false);
    const history = useTakebackHistory({ isAiThinking: isThinking });

    const snapshot = history.createSnapshot(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'w',
      ['p'],
      ['n', 'b']
    );

    expect(snapshot).toEqual({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      moveCount: 0,
      capturedWhite: ['p'],
      capturedBlack: ['n', 'b'],
    });

    history.pushSnapshot(snapshot);
    expect(history.takebackStack.value.length).toBe(1);
    expect(history.canTakeback.value).toBe(true);

    const popped = history.popSnapshot();
    expect(popped).toEqual(snapshot);
    expect(history.takebackStack.value.length).toBe(0);
    expect(history.canTakeback.value).toBe(false);
  });

  it('should disable canTakeback when AI is thinking even if stack is non-empty', () => {
    const isThinking = ref(false);
    const history = useTakebackHistory({ isAiThinking: isThinking });

    const snapshot = history.createSnapshot('fen1', 'w', [], []);
    history.pushSnapshot(snapshot);
    expect(history.canTakeback.value).toBe(true);

    isThinking.value = true;
    expect(history.canTakeback.value).toBe(false);

    isThinking.value = false;
    expect(history.canTakeback.value).toBe(true);
  });

  it('should record moves and update lastMove', () => {
    const history = useTakebackHistory();

    const move1 = createMockMove({
      from: 'e2',
      to: 'e4',
      san: 'e4',
      piece: 'p',
      color: 'w',
    });

    history.recordMove(move1);
    expect(history.moveHistory.value).toEqual([move1]);
    expect(history.lastMove.value).toEqual({ from: 'e2', to: 'e4' });

    const move2 = createMockMove({
      from: 'e7',
      to: 'e5',
      san: 'e5',
      piece: 'p',
      color: 'b',
    });

    history.recordMove(move2);
    expect(history.moveHistory.value).toEqual([move1, move2]);
    expect(history.lastMove.value).toEqual({ from: 'e7', to: 'e5' });
  });

  it('should rewindTo a snapshot, slicing moveHistory, restoring lastMove, and incrementing takebackCount', () => {
    const history = useTakebackHistory();

    const snapshot0 = history.createSnapshot('fen_initial', 'w', [], []);
    history.pushSnapshot(snapshot0);

    const move1 = createMockMove({ from: 'e2', to: 'e4', san: 'e4', piece: 'p', color: 'w' });
    history.recordMove(move1);

    const snapshot1 = history.createSnapshot('fen_after_e4', 'b', [], []);
    history.pushSnapshot(snapshot1);

    const move2 = createMockMove({ from: 'e7', to: 'e5', san: 'e5', piece: 'p', color: 'b' });
    history.recordMove(move2);

    expect(history.moveHistory.value.length).toBe(2);
    expect(history.lastMove.value).toEqual({ from: 'e7', to: 'e5' });
    expect(history.takebackCount.value).toBe(0);

    // Rewind back to snapshot1 (after move 1)
    history.rewindTo(snapshot1);
    expect(history.moveHistory.value.length).toBe(1);
    expect(history.lastMove.value).toEqual({ from: 'e2', to: 'e4' });
    expect(history.takebackCount.value).toBe(1);

    // Rewind back to snapshot0 (initial state)
    history.rewindTo(snapshot0);
    expect(history.moveHistory.value.length).toBe(0);
    expect(history.lastMove.value).toBeNull();
    expect(history.takebackCount.value).toBe(2);
  });

  it('should setLastMove manually and incrementTakebackCount', () => {
    const history = useTakebackHistory();

    history.setLastMove({ from: 'd2', to: 'd4' });
    expect(history.lastMove.value).toEqual({ from: 'd2', to: 'd4' });

    history.setLastMove(null);
    expect(history.lastMove.value).toBeNull();

    history.incrementTakebackCount();
    expect(history.takebackCount.value).toBe(1);
  });

  it('should reset all history state on resetHistory()', () => {
    const history = useTakebackHistory();

    history.pushSnapshot(history.createSnapshot('fen', 'w', [], []));
    history.recordMove(createMockMove({ from: 'e2', to: 'e4', san: 'e4', piece: 'p', color: 'w' }));
    history.incrementTakebackCount();

    expect(history.takebackStack.value.length).toBe(1);
    expect(history.takebackCount.value).toBe(1);
    expect(history.moveHistory.value.length).toBe(1);
    expect(history.lastMove.value).not.toBeNull();
    expect(history.canTakeback.value).toBe(true);

    history.resetHistory();

    expect(history.takebackStack.value).toEqual([]);
    expect(history.takebackCount.value).toBe(0);
    expect(history.moveHistory.value).toEqual([]);
    expect(history.lastMove.value).toBeNull();
    expect(history.canTakeback.value).toBe(false);
  });
});
