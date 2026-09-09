import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryPuzzleProgressStore } from '@/features/puzzles/store/in_memory_puzzle_progress.store';
import { LocalStorageProgressStore } from '@/features/scenarios/store/local_storage_progress.store';
import {
  useGameActions,
  resetGameActionsState,
  onOpponentMove,
} from '@/features/multiplayer/composables/useGameActions';
import {
  useRoomSession,
  resetRoomSessionState,
} from '@/features/multiplayer/composables/useRoomSession';
import { InMemoryStorageAdapter } from '@/platform/storage/in_memory_storage_adapter';
import type { GameState, MoveResult, GameOverPayload } from '@fun-chess/shared';

describe('Store Test Isolation Across Consecutive Test Runs (MAJ-006)', () => {
  let inMemoryStorage: InMemoryStorageAdapter;

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorageAdapter();
    resetGameActionsState(false);
    resetRoomSessionState();
  });

  afterEach(() => {
    inMemoryStorage.clear();
    resetGameActionsState(false);
    resetRoomSessionState();
    vi.restoreAllMocks();
  });

  describe('InMemoryPuzzleProgressStore Isolation', () => {
    it('run 1: mutates progress state with rating and attempts', async () => {
      const store = new InMemoryPuzzleProgressStore();
      await store.updateRating({
        rating: 1550,
        ratingDeviation: 80,
        peakRating: 1550,
        totalAttempted: 15,
        totalSolved: 14,
        bestStreak: 10,
        ratingHistory: [],
      });
      await store.recordPuzzleAttempt('puz-101', 'fork', 'solved_first_try', 3);

      const progress = await store.getProgress();
      expect(progress.ratingProfile.rating).toBe(1550);
      expect(progress.solvedPuzzles['puz-101']?.stars).toBe(3);
    });

    it('run 2: consecutive test receives completely isolated default state', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const progress = await store.getProgress();

      expect(progress.ratingProfile.rating).toBe(800);
      expect(progress.ratingProfile.totalSolved).toBe(0);
      expect(progress.solvedPuzzles['puz-101']).toBeUndefined();
    });

    it('run 3: resetAll() restores pristine initial state within the same store instance', async () => {
      const store = new InMemoryPuzzleProgressStore();
      await store.updateRating({
        rating: 1800,
        ratingDeviation: 70,
        volatility: 0.05,
        peakRating: 1800,
        totalAttempted: 50,
        totalSolved: 48,
        bestStreak: 20,
        ratingHistory: [],
      });

      await store.resetAll();
      const progress = await store.getProgress();

      expect(progress.ratingProfile.rating).toBe(800);
      expect(progress.ratingProfile.totalAttempted).toBe(0);
      expect(progress.ratingProfile.totalSolved).toBe(0);
      expect(Object.keys(progress.solvedPuzzles)).toHaveLength(0);
    });
  });

  describe('LocalStorageProgressStore (Scenarios) Isolation', () => {
    it('run 1: records scenario progress in isolated storage', async () => {
      const store = new LocalStorageProgressStore('test_scenarios_key', inMemoryStorage);
      await store.saveProgress('scenario-alpha', 3, 0);

      const map = await store.getProgressMap();
      expect(map['scenario-alpha']).toBeDefined();
      expect(map['scenario-alpha']?.starsEarned).toBe(3);
    });

    it('run 2: consecutive store with cleared storage has empty progress map', async () => {
      const store = new LocalStorageProgressStore('test_scenarios_key', inMemoryStorage);
      const map = await store.getProgressMap();

      expect(map).toEqual({});
      expect(await store.getProgress('scenario-alpha')).toBeNull();
    });

    it('run 3: resetAllProgress() purges in-memory fallback and underlying storage', async () => {
      const store = new LocalStorageProgressStore('test_scenarios_key', inMemoryStorage);
      await store.saveProgress('scenario-beta', 2, 1);
      expect((await store.getProgressMap())['scenario-beta']).toBeDefined();

      await store.resetAllProgress();

      expect(await store.getProgressMap()).toEqual({});
      expect(await store.getProgress('scenario-beta')).toBeNull();
      expect(inMemoryStorage.getItem('test_scenarios_key')).toBeNull();
    });
  });

  describe('Multiplayer Game Actions & Room Session State Isolation', () => {
    it('run 1: mutates multiplayer action state and adds move listener', () => {
      const game = useGameActions();
      const session = useRoomSession();
      const subscriber = vi.fn();
      onOpponentMove(subscriber);

      game.drawOfferedBy.value = { fromPlayerId: 'p2', fromPlayerName: 'Bob' };
      game.rematchRequestedBy.value = { requestedBy: 'p2', requesterName: 'Bob' };
      game.lastGameOver.value = { winner: 'w', reason: 'checkmate' } as GameOverPayload;
      game.kingInCheck.value = { inCheck: 'w', kingSquare: 'e1' };
      game.lastMoveEvent.value = { move: {} as MoveResult, gameState: {} as GameState };

      session.currentRoom.value = { roomCode: 'TEST1', status: 'playing' } as any;
      session.currentPlayer.value = { id: 'p1', name: 'Alice' } as any;
      session.sessionToken.value = 'token-123';

      expect(game.drawOfferedBy.value).not.toBeNull();
      expect(session.currentRoom.value).not.toBeNull();

      // Reset with preserveSubscribers = false
      resetGameActionsState(false);
      resetRoomSessionState();

      expect(game.drawOfferedBy.value).toBeNull();
      expect(game.rematchRequestedBy.value).toBeNull();
      expect(game.lastGameOver.value).toBeNull();
      expect(game.kingInCheck.value).toBeNull();
      expect(game.lastMoveEvent.value).toBeNull();
      expect(session.currentRoom.value).toBeNull();
      expect(session.currentPlayer.value).toBeNull();
      expect(session.sessionToken.value).toBeNull();
    });

    it('run 2: consecutive test starts in completely clean state with no lingering subscribers', () => {
      const game = useGameActions();
      const session = useRoomSession();

      expect(game.drawOfferedBy.value).toBeNull();
      expect(game.rematchRequestedBy.value).toBeNull();
      expect(game.lastGameOver.value).toBeNull();
      expect(game.kingInCheck.value).toBeNull();
      expect(game.lastMoveEvent.value).toBeNull();
      expect(session.currentRoom.value).toBeNull();
      expect(session.currentPlayer.value).toBeNull();
      expect(session.sessionToken.value).toBeNull();
    });
  });
});
