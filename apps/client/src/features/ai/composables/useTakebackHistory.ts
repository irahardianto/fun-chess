import { ref, computed, type ComputedRef, type Ref } from 'vue';
import type {
  TakebackSnapshot,
  MoveResult,
  PieceColor,
  PieceType,
} from '@fun-chess/shared';

export interface UseTakebackHistoryOptions {
  isAiThinking?: Ref<boolean> | ComputedRef<boolean>;
}

/**
 * useTakebackHistory composable (MAJ-041).
 * Encapsulates move history tracking, undo/takeback snapshot stack,
 * and reactive canTakeback state.
 */
export function useTakebackHistory(options: UseTakebackHistoryOptions = {}) {
  const takebackStack = ref<TakebackSnapshot[]>([]);
  const takebackCount = ref<number>(0);
  const moveHistory = ref<MoveResult[]>([]);
  const lastMove = ref<{ from: string; to: string } | null>(null);

  const canTakeback = computed<boolean>(() => {
    const isThinking = options.isAiThinking?.value ?? false;
    return takebackStack.value.length > 0 && !isThinking;
  });

  function createSnapshot(
    fen: string,
    turn: PieceColor,
    capturedWhite: readonly PieceType[],
    capturedBlack: readonly PieceType[]
  ): TakebackSnapshot {
    return {
      fen,
      turn,
      moveCount: moveHistory.value.length,
      capturedWhite: [...capturedWhite],
      capturedBlack: [...capturedBlack],
    };
  }

  function pushSnapshot(snapshot: TakebackSnapshot): void {
    takebackStack.value.push(snapshot);
  }

  function popSnapshot(): TakebackSnapshot | undefined {
    return takebackStack.value.pop();
  }

  function recordMove(move: MoveResult): void {
    moveHistory.value.push(move);
    lastMove.value = { from: move.from, to: move.to };
  }

  function setLastMove(move: { from: string; to: string } | null): void {
    lastMove.value = move;
  }

  function incrementTakebackCount(): void {
    takebackCount.value++;
  }

  function rewindTo(snapshot: TakebackSnapshot): void {
    moveHistory.value = moveHistory.value.slice(0, snapshot.moveCount);
    lastMove.value = moveHistory.value.length > 0
      ? {
          from: moveHistory.value[moveHistory.value.length - 1]!.from,
          to: moveHistory.value[moveHistory.value.length - 1]!.to,
        }
      : null;
    incrementTakebackCount();
  }

  function resetHistory(): void {
    takebackStack.value = [];
    takebackCount.value = 0;
    moveHistory.value = [];
    lastMove.value = null;
  }

  return {
    takebackStack,
    takebackCount,
    moveHistory,
    lastMove,
    canTakeback,
    createSnapshot,
    pushSnapshot,
    popSnapshot,
    recordMove,
    setLastMove,
    rewindTo,
    resetHistory,
    incrementTakebackCount,
  };
}
