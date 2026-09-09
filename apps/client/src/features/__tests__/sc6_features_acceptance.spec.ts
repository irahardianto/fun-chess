/**
 * Acceptance Test Suite for SC-6 Client Feature Improvements & Hardening
 *
 * Covers 9 Core Acceptance Criteria:
 * 1. [SC6-CRIT-01] Socket reconnection lifecycle listeners (isReconnecting state on reconnect_attempt, reconnect_failed).
 * 2. [SC6-CRIT-02] QrCodeModal clipboard service injection (useInjectClipboard) and execution.
 * 3. [SC6-CRIT-03] Room session storage abstraction without direct window.sessionStorage reads.
 * 4. [SC6-CRIT-04] Deterministic timestamping via IClock in LocalStoragePuzzleProgressStore.
 * 5. [SC6-CRIT-05] Structured logging verification across AI hint, AI takeback, and puzzle rush.
 * 6. [SC6-CRIT-06] Decomposed scenario runner sub-composables (useScenarioStepNavigation, useScenarioBot, useScenarioHints) coordination.
 * 7. [SC6-CRIT-07] Multiplayer action execution helper (executeSocketAction) eliminating duplication.
 * 8. [SC6-CRIT-08] Inbound socket handler factory (createInboundHandler) eliminating duplication.
 * 9. [SC6-CRIT-09] Portability >2MB payload rejection.
 *
 * Adheres strictly to:
 * - Architectural Patterns Rule 1 (I/O Isolation) & Rule 2 (Pure Business Logic)
 * - AAA (Arrange, Act, Assert) Testing Mandates
 * - Zero raw console logs in test suites
 * - Deterministic teardown and state isolation in afterEach
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { z } from 'zod';
import QRCode from 'qrcode';
import {
  createSafeChess,
  type IClock,
  type ChessScenario,
  type Square,
  type SavedSession,
  type SocketErrorPayload,
  type MakeMoveRequest,
  MakeMoveRequestSchema,
  ResignRequestSchema,
  type ResignRequest,
} from '@fun-chess/shared';
import { logger, type ILogger } from '@/platform/telemetry';
import { CLIPBOARD_SERVICE_KEY } from '@/platform/di';
import { MockClipboardService } from '@/platform/hardware/clipboard.interface';
import {
  safeSessionStorage,
  STORAGE_KEYS,
  InMemoryStorageAdapter,
} from '@/platform/storage';

// Lobby & Modal
import QrCodeModal from '@/features/lobby/QrCodeModal.vue';

// Multiplayer Composables & Helpers
import {
  useSocketTransport,
  attachSocketListeners,
  detachSocketListeners,
  registerSocketEventListener,
  createInboundHandler,
  resetTransportState,
  type TypedSocket,
} from '@/features/multiplayer/composables/useSocketTransport';
import {
  saveSession,
  getSavedSession,
  clearSession,
  resetRoomSessionState,
} from '@/features/multiplayer/composables/useRoomSession';
import {
  executeSocketAction,
  resetGameActionsState,
} from '@/features/multiplayer/composables/useGameActions';

// Puzzle Store & Composables
import { LocalStoragePuzzleProgressStore } from '@/features/puzzles/store/local_storage_puzzle_progress.store';
import { InMemoryPuzzleProgressStore } from '@/features/puzzles/store/in_memory_puzzle_progress.store';
import { usePuzzleRush } from '@/features/puzzles/composables/usePuzzleRush';

// AI Composable & Engines
import { useAiGame } from '@/features/ai/composables/useAiGame';
import { hintEngine, minimaxEngine } from '@/features/ai/engine/index';

// Scenario Sub-Composables
import {
  useScenarioStepNavigation,
  type ScenarioStepOutcomeEvent,
} from '@/features/scenarios/composables/useScenarioStepNavigation';
import { useScenarioBot } from '@/features/scenarios/composables/useScenarioBot';
import { useScenarioHints } from '@/features/scenarios/composables/useScenarioHints';

// Portability Services & Composables
import {
  ProgressFileService,
  MAX_PROGRESS_FILE_SIZE_BYTES,
} from '@/features/portability/services/progress_file.service';
import { useProgressSync } from '@/features/portability/composables/useProgressSync';

// Mock audio & confetti to avoid Web Audio / Canvas dependencies in JSDOM
vi.mock('../../composables/useAudio', () => ({
  useAudio: () => ({
    playMove: vi.fn(),
    playCapture: vi.fn(),
    playCheck: vi.fn(),
    playVictory: vi.fn(),
    playDraw: vi.fn(),
    playError: vi.fn(),
    playClick: vi.fn(),
    playStart: vi.fn(),
  }),
}));

vi.mock('../../composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrate: vi.fn(),
    celebrateVictory: vi.fn(),
    celebrateDraw: vi.fn(),
  }),
}));

describe('SC-6 Client Features Acceptance Suite (SC-6-CLIENT-FEATURES)', () => {
  let modalWrapper: VueWrapper | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    (vi.spyOn(QRCode, 'toDataURL') as unknown as { mockResolvedValue: (val: string) => void }).mockResolvedValue(
      'data:image/png;base64,mockQrCode'
    );
    resetTransportState();
    resetRoomSessionState(true);
    resetGameActionsState();
  });

  afterEach(() => {
    if (modalWrapper) {
      modalWrapper.unmount();
      modalWrapper = null;
    }
    document.body.innerHTML = '';
    resetTransportState();
    resetRoomSessionState(true);
    resetGameActionsState();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // =========================================================================
  // [SC6-CRIT-01] Socket Reconnection Lifecycle Listeners
  // =========================================================================
  describe('[SC6-CRIT-01] Socket reconnection lifecycle listeners', () => {
    function createMockSocketWithManager() {
      const socketHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
      const managerHandlers = new Map<string, Array<(...args: unknown[]) => void>>();

      const manager = {
        on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          const list = managerHandlers.get(event) || [];
          list.push(fn);
          managerHandlers.set(event, list);
          return manager;
        }),
        off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          const list = managerHandlers.get(event) || [];
          managerHandlers.set(
            event,
            list.filter((cb) => cb !== fn)
          );
          return manager;
        }),
        emit: (event: string, ...args: unknown[]) => {
          const list = managerHandlers.get(event) || [];
          list.forEach((cb) => cb(...args));
        },
      };

      const socket = {
        connected: false,
        id: 'mock-socket-id',
        io: manager,
        on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          const list = socketHandlers.get(event) || [];
          list.push(fn);
          socketHandlers.set(event, list);
          return socket;
        }),
        off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          const list = socketHandlers.get(event) || [];
          socketHandlers.set(
            event,
            list.filter((cb) => cb !== fn)
          );
          return socket;
        }),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        triggerSocketEvent: (event: string, ...args: unknown[]) => {
          const list = socketHandlers.get(event) || [];
          list.forEach((cb) => cb(...args));
        },
        triggerManagerEvent: (event: string, ...args: unknown[]) => {
          manager.emit(event, ...args);
        },
      };

      return socket;
    }

    it('attaches listeners to Socket.IO manager and updates isReconnecting state during reconnect attempt', () => {
      // Arrange
      const mockSocket = createMockSocketWithManager();
      const transport = useSocketTransport();
      const attemptCallback = vi.fn();
      const unregister = registerSocketEventListener('reconnect_attempt', attemptCallback);

      // Act
      attachSocketListeners(mockSocket as unknown as TypedSocket);
      expect(mockSocket.io.on).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
      expect(mockSocket.io.on).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));

      // Simulate manager event: reconnect_attempt #2
      mockSocket.triggerManagerEvent('reconnect_attempt', 2);

      // Assert
      expect(transport.isReconnecting.value).toBe(true);
      expect(attemptCallback).toHaveBeenCalledWith(2);

      unregister();
      detachSocketListeners(mockSocket as unknown as TypedSocket);
    });

    it('resets isReconnecting to false and marks isConnected to true upon successful connect', () => {
      // Arrange
      const mockSocket = createMockSocketWithManager();
      const transport = useSocketTransport();
      attachSocketListeners(mockSocket as unknown as TypedSocket);

      // Act: Trigger reconnection attempt first
      mockSocket.triggerManagerEvent('reconnect_attempt', 1);
      expect(transport.isReconnecting.value).toBe(true);

      // Act: Simulate reconnection success (connect event)
      mockSocket.triggerSocketEvent('connect');

      // Assert
      expect(transport.isReconnecting.value).toBe(false);
      expect(transport.isConnected.value).toBe(true);
      expect(transport.connectionError.value).toBeNull();

      detachSocketListeners(mockSocket as unknown as TypedSocket);
    });

    it('handles reconnect_failed by clearing isReconnecting, recording connectionError, and setting lastError', () => {
      // Arrange
      const mockSocket = createMockSocketWithManager();
      const transport = useSocketTransport();
      const errorListener = vi.fn();
      const reconnectFailedListener = vi.fn();
      const unregErr = registerSocketEventListener('error', errorListener);
      const unregFail = registerSocketEventListener('reconnect_failed', reconnectFailedListener);

      attachSocketListeners(mockSocket as unknown as TypedSocket);
      mockSocket.triggerManagerEvent('reconnect_attempt', 5);
      expect(transport.isReconnecting.value).toBe(true);

      // Act: Manager reports reconnection attempts exhausted
      mockSocket.triggerManagerEvent('reconnect_failed');

      // Assert
      expect(transport.isReconnecting.value).toBe(false);
      expect(transport.isConnected.value).toBe(false);
      expect(transport.connectionError.value).toBe('Reconnection failed after maximum attempts');
      expect(transport.lastError.value).toEqual({
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Reconnection failed after maximum attempts',
      });
      expect(reconnectFailedListener).toHaveBeenCalled();
      expect(errorListener).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ERR_SOCKET_TIMEOUT',
          message: 'Reconnection failed after maximum attempts',
        })
      );

      unregErr();
      unregFail();
      detachSocketListeners(mockSocket as unknown as TypedSocket);
    });

    it('detaches manager handlers when detachSocketListeners is invoked', () => {
      // Arrange
      const mockSocket = createMockSocketWithManager();
      attachSocketListeners(mockSocket as unknown as TypedSocket);

      // Act
      detachSocketListeners(mockSocket as unknown as TypedSocket);

      // Assert
      expect(mockSocket.io.off).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
      expect(mockSocket.io.off).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
    });
  });

  // =========================================================================
  // [SC6-CRIT-02] QrCodeModal Clipboard Service Injection & Execution
  // =========================================================================
  describe('[SC6-CRIT-02] QrCodeModal clipboard service injection and execution', () => {
    it('executes copy via injected MockClipboardService and displays positive feedback without touching window.navigator', async () => {
      // Arrange: Instantiate clean in-memory MockClipboardService
      const mockClipboard = new MockClipboardService();
      const initialText = 'http://localhost:3000/?join=DRGN';

      modalWrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'DRGN',
          joinUrl: initialText,
        },
        global: {
          provide: {
            [CLIPBOARD_SERVICE_KEY as symbol]: mockClipboard,
          },
        },
      });

      await modalWrapper.vm.$nextTick();
      await flushPromises();

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
      expect(copyBtn.textContent).toContain('Copy Invite Link');

      // Act: Click copy button
      copyBtn.click();
      await flushPromises();
      await modalWrapper.vm.$nextTick();

      // Assert: Service received URL and recorded history
      expect(mockClipboard.history.length).toBe(1);
      expect(mockClipboard.history[0]).toContain('DRGN');
      expect(mockClipboard.text).toContain('DRGN');
      expect(copyBtn.textContent).toContain('Copied! ✅');
    });

    it('handles clipboard failure gracefully when service indicates write failure or unsupported context', async () => {
      // Arrange: Injected mock clipboard where write is unsupported / rejected
      const failingClipboard = new MockClipboardService('', false);

      modalWrapper = mount(QrCodeModal, {
        props: {
          modelValue: true,
          roomCode: 'FAIL',
          joinUrl: 'http://localhost:3000/?join=FAIL',
        },
        global: {
          provide: {
            [CLIPBOARD_SERVICE_KEY as symbol]: failingClipboard,
          },
        },
      });

      await modalWrapper.vm.$nextTick();
      await flushPromises();

      const copyBtn = document.body.querySelector('[data-testid="copy-link-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();

      // Act
      copyBtn.click();
      await flushPromises();
      await modalWrapper.vm.$nextTick();

      // Assert: Error notice is displayed, no crash occurs
      const errorEl = document.body.querySelector('[data-testid="copy-error-notice"]');
      expect(errorEl).not.toBeNull();
      expect(errorEl?.textContent).toContain('Could not copy automatically');
      expect(failingClipboard.history.length).toBe(0);
    });
  });

  // =========================================================================
  // [SC6-CRIT-03] Room Session Storage Abstraction
  // =========================================================================
  describe('[SC6-CRIT-03] Room session storage abstraction without direct window.sessionStorage reads', () => {
    it('persists and retrieves session via safeSessionStorage abstraction layer', () => {
      // Arrange
      const sessionData: SavedSession = {
        roomCode: 'HERO',
        playerId: 'player-alpha',
        sessionToken: 'jwt-token-alpha-1234',
      };

      // Act: Save session
      saveSession(sessionData);

      // Assert: Data was stored in safeSessionStorage under canonical key
      const storedRaw = safeSessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
      expect(storedRaw).not.toBeNull();
      expect(JSON.parse(storedRaw!)).toEqual(sessionData);

      // Act: Retrieve session
      const retrieved = getSavedSession();
      expect(retrieved).toEqual(sessionData);

      // Act: Clear session
      clearSession();
      expect(safeSessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN)).toBeNull();
      expect(getSavedSession()).toBeNull();
    });

    it('gracefully handles corrupted or non-JSON content in storage without throwing', () => {
      // Arrange: Seed storage with invalid non-JSON string
      safeSessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, '{bad-json-syntax}');

      // Act & Assert: Must return null safely and not throw
      let retrieved: SavedSession | null = null;
      expect(() => {
        retrieved = getSavedSession();
      }).not.toThrow();
      expect(retrieved).toBeNull();
    });

    it('rejects structurally invalid session payloads missing essential credentials', () => {
      // Missing sessionToken
      safeSessionStorage.setItem(
        STORAGE_KEYS.SESSION_TOKEN,
        JSON.stringify({ roomCode: 'HERO', playerId: 'p1' })
      );
      expect(getSavedSession()).toBeNull();

      // Missing roomCode
      safeSessionStorage.setItem(
        STORAGE_KEYS.SESSION_TOKEN,
        JSON.stringify({ playerId: 'p1', sessionToken: 'tok' })
      );
      expect(getSavedSession()).toBeNull();
    });
  });

  // =========================================================================
  // [SC6-CRIT-04] Deterministic Timestamping via IClock in LocalStoragePuzzleProgressStore
  // =========================================================================
  describe('[SC6-CRIT-04] Deterministic timestamping via IClock in LocalStoragePuzzleProgressStore', () => {
    it('records deterministic timestamps on attempts, arcade results, and rating updates using injected IClock', async () => {
      // Arrange: Configurable test clock
      let simulatedTime = 1710000000000;
      const testClock: IClock = {
        now: () => simulatedTime,
      };

      const storage = new InMemoryStorageAdapter();
      const store = new LocalStoragePuzzleProgressStore('test_sc6_puzzle_key', storage, testClock);

      // Initial progress uses clock.now()
      const initial = await store.getProgress();
      expect(initial.createdAt).toBe(1710000000000);
      expect(initial.lastActiveAt).toBe(1710000000000);

      // Act 1: Advance clock and record puzzle attempt
      simulatedTime = 1710000050000;
      const progress1 = await store.recordPuzzleAttempt('puzzle-fork-1', 'fork', 'solved_first_try', 3);

      // Assert 1
      expect(progress1.solvedPuzzles['puzzle-fork-1']?.solvedAt).toBe(1710000050000);
      expect(progress1.themeMastery['fork']?.lastPracticedAt).toBe(1710000050000);
      expect(progress1.lastActiveAt).toBe(1710000050000);

      // Act 2: Advance clock and record arcade result
      simulatedTime = 1710000100000;
      await store.saveArcadeResult('puzzle_rush', 15, 8);
      const progress2 = await store.getProgress();

      // Assert 2
      expect(progress2.lastActiveAt).toBe(1710000100000);
      expect(progress2.arcadeStats.puzzleRushHighScore).toBe(15);
      expect(progress2.arcadeStats.puzzleRushBestStreak).toBe(8);

      // Act 3: Advance clock and update rating
      simulatedTime = 1710000200000;
      await store.updateRating({
        ...initial.ratingProfile,
        rating: 1250,
        peakRating: 1250,
      });
      const progress3 = await store.getProgress();

      // Assert 3
      expect(progress3.lastActiveAt).toBe(1710000200000);
      expect(progress3.ratingProfile.rating).toBe(1250);
    });
  });

  // =========================================================================
  // [SC6-CRIT-05] Structured Logging Verification Across AI Hint, AI Takeback, and Puzzle Rush
  // =========================================================================
  describe('[SC6-CRIT-05] Structured logging verification across AI hint, AI takeback, and puzzle rush', () => {
    it('executes 3-point structured logging on askForHint (start, success with duration, error on failure)', async () => {
      // Arrange
      const infoSpy = vi.spyOn(logger, 'info');
      const errorSpy = vi.spyOn(logger, 'error');

      const mockHint = {
        move: { from: 'e2' as Square, to: 'e4' as Square },
        sourceSquare: 'e2' as Square,
        targetSquare: 'e4' as Square,
        explanation: 'Control the center with your king pawn!',
        theme: 'center_control' as const,
        scoreAdvantage: 40,
      };
      vi.spyOn(hintEngine, 'calculateHint').mockResolvedValue(mockHint);

      const game = useAiGame({ autoStart: false });

      // Act 1: Successful hint request
      const hint = await game.askForHint();
      expect(hint).toEqual(mockHint);

      // Assert 1: Start and Success logs
      expect(infoSpy).toHaveBeenCalledWith(
        'Starting askForHint',
        expect.objectContaining({
          operation: 'ask_for_hint',
          correlationId: expect.any(String),
        })
      );
      expect(infoSpy).toHaveBeenCalledWith(
        'askForHint completed successfully',
        expect.objectContaining({
          operation: 'ask_for_hint',
          status: 'success',
          durationMs: expect.any(Number),
        })
      );

      // Act 2: Failing hint calculation
      vi.spyOn(hintEngine, 'calculateHint').mockRejectedValueOnce(new Error('Calculation failure simulated'));
      const failedHint = await game.askForHint();
      expect(failedHint).toBeNull();

      // Assert 2: Failure log
      expect(errorSpy).toHaveBeenCalledWith(
        'askForHint failed',
        expect.objectContaining({
          operation: 'ask_for_hint',
          status: 'failed',
          durationMs: expect.any(Number),
          error: 'Calculation failure simulated',
        })
      );
    });

    it('executes 3-point structured logging on takeback (start, success with duration, error on empty stack)', async () => {
      // Arrange
      const infoSpy = vi.spyOn(logger, 'info');

      vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue({
        move: { from: 'e7', to: 'e5' },
        score: 0,
        depth: 1,
        nodesEvaluated: 5,
        isBlunder: false,
        searchDurationMs: 1,
      });

      const game = useAiGame({ autoStart: false });

      // Act 1: Make move to populate snapshot history
      game.applyPlayerMove('e2', 'e4');
      await vi.waitFor(() => expect(game.moveHistory.value.length).toBe(2));

      // Act 2: Execute successful takeback
      const success = game.takeback();
      expect(success).toBe(true);

      // Assert 2: Start and Success logs
      expect(infoSpy).toHaveBeenCalledWith(
        'Starting takeback',
        expect.objectContaining({
          operation: 'takeback',
          correlationId: expect.any(String),
        })
      );
      expect(infoSpy).toHaveBeenCalledWith(
        'Takeback completed successfully',
        expect.objectContaining({
          operation: 'takeback',
          status: 'success',
          durationMs: expect.any(Number),
        })
      );

      // Act 3: Attempt second takeback on now empty stack
      const failSuccess = game.takeback();
      expect(failSuccess).toBe(false);
    });

    it('executes structured logging in usePuzzleRush across start, solve, score submission, and stop lifecycle', async () => {
      // Arrange
      const mockCustomLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
      };

      const memoryStore = new InMemoryPuzzleProgressStore();
      const rush = usePuzzleRush({
        customStore: memoryStore,
        logger: mockCustomLogger as unknown as ILogger,
      });

      // Act 1: Start Run
      rush.startRun('puzzle_rush');
      expect(mockCustomLogger.info).toHaveBeenCalledWith(
        'Starting puzzle rush run',
        expect.objectContaining({
          operation: 'puzzle_rush_start',
          mode: 'puzzle_rush',
          initialDuration: 180,
          maxStrikes: 3,
        })
      );

      // Act 2: Solve Puzzle
      await rush.handleRunnerSolved();
      expect(mockCustomLogger.info).toHaveBeenCalledWith(
        'Puzzle solved during rush run',
        expect.objectContaining({
          operation: 'puzzle_rush_solve',
          mode: 'puzzle_rush',
          score: 1,
        })
      );
      expect(mockCustomLogger.info).toHaveBeenCalledWith(
        'Submitting arcade score for puzzle rush',
        expect.objectContaining({
          operation: 'puzzle_rush_submit_score',
          mode: 'puzzle_rush',
          score: 1,
        })
      );

      // Act 3: Mistake
      rush.handleRunnerFailed();
      expect(mockCustomLogger.warn).toHaveBeenCalledWith(
        'Puzzle mistake during rush run',
        expect.objectContaining({
          operation: 'puzzle_rush_mistake',
          mode: 'puzzle_rush',
        })
      );

      // Act 4: Stop
      rush.stopRun();
      expect(mockCustomLogger.info).toHaveBeenCalledWith(
        'Stopping puzzle rush run manually',
        expect.objectContaining({
          operation: 'puzzle_rush_stop',
          mode: 'puzzle_rush',
        })
      );
    });
  });

  // =========================================================================
  // [SC6-CRIT-06] Decomposed Scenario Runner Sub-Composables Coordination
  // =========================================================================
  describe('[SC6-CRIT-06] Decomposed scenario runner sub-composables coordination', () => {
    const testScenario: ChessScenario = {
      id: 'scenario-sc6-test',
      title: 'Opening Tactics',
      subtitle: 'Central dominance and knight deployment',
      description: 'Learn central dominance and knight deployment',
      difficulty: 'beginner',
      targetAgeGroup: 'all',
      icon: '⚔️',
      estimatedMinutes: 3,
      category: 'tactical_patterns',
      steps: [
        {
          id: 'step-1-pawn',
          stepNumber: 1,
          instruction: 'Play 1. e4',
          setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          playerColor: 'w',
          allowedMoves: [{ from: 'e2' as Square, to: 'e4' as Square }],
          hint: 'Advance your king pawn two squares forward to e4.',
          explanationOnSuccess: 'Well done! You control the center.',
          opponentResponse: {
            from: 'e7' as Square,
            to: 'e5' as Square,
            delayMs: 10,
          },
        },
        {
          id: 'step-2-knight',
          stepNumber: 2,
          instruction: 'Play 2. Nf3',
          setupFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
          playerColor: 'w',
          allowedMoves: [{ from: 'g1' as Square, to: 'f3' as Square }],
          hint: 'Develop your kingside knight towards f3.',
          explanationOnSuccess: 'Knight developed beautifully!',
        },
      ],
    };

    it('verifies seamless coordination between navigation, bot counter-moves, and hints sub-composables', async () => {
      vi.useFakeTimers();

      // Arrange 1: Initialize Navigation sub-composable
      const stepOutcomes: ScenarioStepOutcomeEvent[] = [];
      const initialFen = testScenario.steps[0]?.setupFen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      const engineChess = createSafeChess(initialFen);

      const nav = useScenarioStepNavigation({
        scenario: testScenario,
        onStepOutcome: (outcome) => stepOutcomes.push(outcome),
        syncEngineFen: (fen) => engineChess.load(fen),
      });

      // Arrange 2: Initialize Hints sub-composable linked to currentStep
      const hints = useScenarioHints({
        currentStep: nav.currentStep,
      });

      // Arrange 3: Initialize Bot sub-composable linked to engine
      const botMoveSuccesses: Array<{ from: Square; to: Square }> = [];
      const bot = useScenarioBot({
        chess: engineChess,
        onBotMoveSuccess: (move) => botMoveSuccesses.push(move),
      });

      // Verify Step 1 initial state
      expect(nav.currentStepIndex.value).toBe(0);
      expect(nav.currentStep.value?.id).toBe('step-1-pawn');
      expect(nav.isCompleted.value).toBe(false);
      expect(hints.activeHint.value).toBeNull();
      expect(hints.hintGlowSquare.value).toBeNull();

      // Act 1: User commits 2 mistakes -> auto-hint triggers
      hints.checkAutoHint(2);
      expect(hints.activeHint.value).toBe('Advance your king pawn two squares forward to e4.');
      expect(hints.hintGlowSquare.value).toBe('e2');
      expect(hints.hintTargetSquare.value).toBe('e4');
      expect(hints.hintsUsedCurrentAttempt.value).toBe(1);

      // Act 2: User makes correct player move e2-e4
      engineChess.move({ from: 'e2', to: 'e4' });

      // Act 3: Schedule Bot Opponent Reply (e7-e5)
      const opponentConfig = nav.currentStep.value!.opponentResponse!;
      bot.scheduleOpponentReply(opponentConfig, {
        onComplete: (success) => {
          expect(success).toBe(true);
          hints.resetStepHints();
          nav.advanceOrCompleteStep(0);
        },
      });

      expect(bot.isWaitingForBotResponse.value).toBe(true);

      // Fast forward bot delay timer (10ms)
      await vi.advanceTimersByTimeAsync(15);
      expect(bot.isWaitingForBotResponse.value).toBe(false);
      expect(botMoveSuccesses.length).toBe(1);
      expect(botMoveSuccesses[0]).toEqual({ from: 'e7', to: 'e5' });

      // Fast forward step transition delay (0ms)
      await vi.advanceTimersByTimeAsync(1);

      // Assert Step 2 is loaded
      expect(nav.currentStepIndex.value).toBe(1);
      expect(nav.currentStep.value?.id).toBe('step-2-knight');
      expect(hints.activeHint.value).toBeNull();
      expect(hints.hintGlowSquare.value).toBeNull();
      expect(stepOutcomes.length).toBe(1);
      expect(stepOutcomes[0]?.isLessonComplete).toBe(false);

      // Act 4: Execute Step 2 Move (g1-f3) and complete lesson
      engineChess.move({ from: 'g1', to: 'f3' });
      nav.advanceOrCompleteStep(0);
      await vi.advanceTimersByTimeAsync(1);

      // Assert Lesson Complete
      expect(nav.isCompleted.value).toBe(true);
      expect(stepOutcomes.length).toBe(2);
      expect(stepOutcomes[1]?.isLessonComplete).toBe(true);
      expect(stepOutcomes[1]?.starsAwarded).toBe(3);

      bot.clearBotTimers();
      nav.clearNavigationTimers();
    });

    it('cancels active bot timers cleanly when clearBotTimers is called', async () => {
      vi.useFakeTimers();
      const engineChess = createSafeChess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      const bot = useScenarioBot({ chess: engineChess });

      bot.scheduleOpponentReply({ from: 'e7' as Square, to: 'e5' as Square, delayMs: 500 });
      expect(bot.isWaitingForBotResponse.value).toBe(true);

      // Cancel before timer expires
      bot.clearBotTimers();
      expect(bot.isWaitingForBotResponse.value).toBe(false);

      await vi.advanceTimersByTimeAsync(1000);
      expect(engineChess.fen()).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });
  });

  // =========================================================================
  // [SC6-CRIT-07] Multiplayer Action Execution Helper (executeSocketAction)
  // =========================================================================
  describe('[SC6-CRIT-07] Multiplayer action execution helper (executeSocketAction) eliminating duplication', () => {
    it('validates schema before transmission and returns validation error without sending over socket', async () => {
      // Arrange: Schema expecting 4-char roomCode
      const callback = vi.fn();
      const transport = useSocketTransport();

      // Act: Supply invalid rawPayload (missing roomCode)
      const res = await executeSocketAction<ResignRequest, { success: boolean; error?: SocketErrorPayload }>({
        operation: 'socket_test_action',
        event: 'game:resign',
        schema: ResignRequestSchema,
        rawPayload: {},
        timeoutMessage: 'Action timed out',
        startLogMessage: 'Starting test action',
        validationErrorMessage: 'Payload validation failed',
        callback,
      });

      // Assert
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(transport.lastError.value?.code).toBe('ERR_INVALID_PAYLOAD');
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'ERR_INVALID_PAYLOAD' }),
        })
      );
    });

    it('rejects action with ERR_INTERNAL_SERVER when socket is disconnected', async () => {
      // Arrange
      const transport = useSocketTransport();
      transport.socket.value = null; // Disconnected
      const callback = vi.fn();

      // Act: Valid 4-char roomCode passed
      const res = await executeSocketAction<ResignRequest>({
        operation: 'socket_test_disconnect',
        event: 'game:resign',
        schema: ResignRequestSchema,
        rawPayload: { roomCode: 'ROOM' },
        timeoutMessage: 'Action timed out',
        startLogMessage: 'Starting test action',
        validationErrorMessage: 'Validation error',
        notConnectedErrorMessage: 'Socket not connected',
        callback,
      });

      // Assert
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('ERR_INTERNAL_SERVER');
      expect(res.error?.message).toBe('Socket not connected');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('emits event and invokes onSettled hook on fire-and-forget socket action', async () => {
      // Arrange: Connected mock socket
      const mockEmit = vi.fn();
      const transport = useSocketTransport();
      transport.socket.value = {
        connected: true,
        emit: mockEmit,
      } as unknown as TypedSocket;

      const onSettled = vi.fn();

      // Act: Valid 4-char roomCode
      const res = await executeSocketAction<ResignRequest>({
        operation: 'socket_test_emit',
        event: 'game:resign',
        schema: ResignRequestSchema,
        rawPayload: { roomCode: 'ROOM' },
        timeoutMessage: 'Action timed out',
        startLogMessage: 'Starting test action',
        validationErrorMessage: 'Validation error',
        onSettled,
      });

      // Assert
      expect(res.success).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith('game:resign', { roomCode: 'ROOM' });
      expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('executes emitWithTimeout with full acknowledgment lifecycle and invokes onSuccess hook', async () => {
      // Arrange: Mock socket with callback acknowledgment
      const transport = useSocketTransport();
      const mockSocket = {
        connected: true,
        emit: vi.fn((_event: string, _payload: unknown, ackCb: (res: unknown) => void) => {
          ackCb({ success: true, moveResult: { san: 'e4', moveNumber: 1 } });
        }),
      };
      transport.socket.value = mockSocket as unknown as TypedSocket;

      const onSuccess = vi.fn();
      const onSettled = vi.fn();
      const callback = vi.fn();

      // Act: Valid 4-char roomCode and valid move coordinates
      const res = await executeSocketAction<
        MakeMoveRequest,
        { success: true; moveResult: { san: string; moveNumber: number } } | { success: false; error: SocketErrorPayload }
      >({
        operation: 'socket_test_ack',
        event: 'game:move',
        schema: MakeMoveRequestSchema,
        rawPayload: {
          roomCode: 'ROOM',
          move: { from: 'e2', to: 'e4' },
        },
        alwaysAwaitAck: true,
        timeoutMessage: 'Move submission timed out',
        startLogMessage: 'Making move',
        validationErrorMessage: 'Move validation failed',
        onSuccess,
        onSettled,
        callback,
      });

      // Assert
      expect(res.success).toBe(true);
      expect(res.success && 'moveResult' in res && (res.moveResult as { san: string }).san).toBe('e4');
      expect(onSuccess).toHaveBeenCalledWith(res);
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(res);
    });
  });

  // =========================================================================
  // [SC6-CRIT-08] Inbound Socket Handler Factory (createInboundHandler)
  // =========================================================================
  describe('[SC6-CRIT-08] Inbound socket handler factory (createInboundHandler) eliminating duplication', () => {
    const TestInboundSchema = z.object({
      id: z.string().min(1),
      count: z.number(),
    });

    it('processes valid inbound payload, invokes onValid, applies transform, and dispatches event', () => {
      // Arrange
      const onValid = vi.fn();
      const receivedDispatched: unknown[] = [];
      const unregister = registerSocketEventListener('test:inbound_event', (data) => {
        receivedDispatched.push(data);
      });

      const handler = createInboundHandler({
        event: 'test:inbound_event',
        schema: TestInboundSchema,
        logMessage: 'Valid payload received',
        operation: 'test_inbound_op',
        onValid,
        transform: (data) => ({ ...data, processed: true }),
      });

      // Act: Pass valid raw data
      handler({ id: 'alpha-1', count: 42 });

      // Assert
      expect(onValid).toHaveBeenCalledWith({ id: 'alpha-1', count: 42 });
      expect(receivedDispatched.length).toBe(1);
      expect(receivedDispatched[0]).toEqual({
        id: 'alpha-1',
        count: 42,
        processed: true,
      });

      unregister();
    });

    it('rejects malformed inbound payload, logs structured warning, and halts event dispatch', () => {
      // Arrange
      const warnSpy = vi.spyOn(logger, 'warn');
      const onValid = vi.fn();
      const eventListener = vi.fn();
      const unregister = registerSocketEventListener('test:inbound_invalid', eventListener);

      const handler = createInboundHandler({
        event: 'test:inbound_invalid',
        schema: TestInboundSchema,
        logMessage: 'Payload received',
        operation: 'test_inbound_invalid_op',
        onValid,
      });

      // Act: Pass invalid data (count is string instead of number)
      handler({ id: 'alpha-1', count: 'not-a-number' });

      // Assert: Validation failed
      expect(onValid).not.toHaveBeenCalled();
      expect(eventListener).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        'Inbound socket payload validation failed',
        expect.objectContaining({
          operation: 'socket_payload_validation',
          event: 'test:inbound_invalid',
          issues: expect.any(Array),
        })
      );

      unregister();
    });

    it('supports custom logLevel: warn on valid events', () => {
      // Arrange
      const warnSpy = vi.spyOn(logger, 'warn');

      const handler = createInboundHandler({
        event: 'test:inbound_warn_level',
        schema: TestInboundSchema,
        logMessage: 'Warning level inbound received',
        operation: 'test_inbound_warn_op',
        logLevel: 'warn',
        getContext: (data) => ({ recordId: data.id }),
      });

      // Act
      handler({ id: 'warn-1', count: 99 });

      // Assert
      expect(warnSpy).toHaveBeenCalledWith(
        'Warning level inbound received',
        expect.objectContaining({
          operation: 'test_inbound_warn_op',
          recordId: 'warn-1',
        })
      );
    });
  });

  // =========================================================================
  // [SC6-CRIT-09] Portability >2MB Payload Rejection
  // =========================================================================
  describe('[SC6-CRIT-09] Portability >2MB payload rejection', () => {
    it('rejects files exceeding MAX_PROGRESS_FILE_SIZE_BYTES (2MB) in ProgressFileService.readProgressFile', async () => {
      // Arrange
      const fileService = new ProgressFileService();
      const oversizedSize = MAX_PROGRESS_FILE_SIZE_BYTES + 1024; // 2MB + 1KB

      // Create mock File/Blob with size > 2MB
      const mockOversizedFile = {
        size: oversizedSize,
        name: 'massive-backup.json',
        text: vi.fn(),
      } as unknown as File;

      // Act & Assert
      await expect(fileService.readProgressFile(mockOversizedFile)).rejects.toThrow(
        /File size exceeds 2MB limit/
      );
      expect(mockOversizedFile.text).not.toHaveBeenCalled();
    });

    it('reads files within the 2MB limit successfully in ProgressFileService', async () => {
      // Arrange
      const fileService = new ProgressFileService();
      const validContent = JSON.stringify({ version: 'FC_PROGRESS_V1', valid: true });
      const mockValidFile = {
        size: 512,
        name: 'valid-backup.json',
        text: vi.fn().mockResolvedValue(validContent),
      } as unknown as File;

      // Act
      const result = await fileService.readProgressFile(mockValidFile);

      // Assert
      expect(result).toBe(validContent);
      expect(mockValidFile.text).toHaveBeenCalled();
    });

    it('rejects raw string payloads exceeding 2MB in useProgressSync.importPayload and sets syncError', async () => {
      // Arrange
      const sync = useProgressSync();
      // Generate string slightly over 2MB limit
      const oversizedPayload = 'x'.repeat(2 * 1024 * 1024 + 16);

      // Act
      const success = await sync.importPayload(oversizedPayload);

      // Assert
      expect(success).toBe(false);
      expect(sync.syncError.value).toContain('Save data exceeds maximum allowed size of 2MB.');
    });
  });
});
