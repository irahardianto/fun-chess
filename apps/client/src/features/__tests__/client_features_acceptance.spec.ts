import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Puzzle, UnifiedProgressPayload } from '@fun-chess/shared';
import { sanitizeAndValidateProgress } from '@fun-chess/shared';
import { logger } from '@/platform/telemetry';
import { analyzePuzzleSolution } from '@/features/puzzles/engine/puzzle_analysis_engine';
import { MinimaxEngine } from '@/features/ai/engine/minimax_engine';
import { LocalStorageUnifiedStore } from '@/features/portability/store/local_storage_unified.store';
import { useAiWorker } from '@/features/ai/composables/useAiWorker';
import { LocalStoragePuzzleProgressStore } from '@/features/puzzles/store/local_storage_puzzle_progress.store';
import { useCameraStream, stopMediaStreamTracks } from '@/features/portability/composables/useCameraStream';
import { useQrDecoder } from '@/features/portability/composables/useQrDecoder';
import { useAiBoardState } from '@/features/ai/composables/useAiBoardState';
import { minimaxEngine } from '@/features/ai/engine';
import type { Move } from 'chess.js';

describe('Client Features Acceptance Suite (SC-4-CLIENT-FEATURES)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // [MAJ-006]: Engine simulation error handling in puzzle analysis
  // =========================================================================
  describe('[MAJ-006] Engine simulation error handling and graceful break', () => {
    it('catches invalid/illegal moves during puzzle simulation, breaks gracefully without throwing, and returns structured outcome without logger side-effects', () => {
      const errorSpy = vi.spyOn(logger, 'error');

      // Valid FEN starting position, but moves array contains an illegal rook leap across pawns ('a1h8')
      const invalidPuzzle: Puzzle = {
        id: 'puzzle-maj-006-test',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: ['e2e4', 'e7e5', 'a1h8'], // 'a1h8' is completely illegal for White's rook
        playerColor: 'w',
        rating: 1000,
        ratingDeviation: 100,
        themes: ['fork'],
        primaryTheme: 'fork',
        difficulty: 'easy',
        title: 'Test Illegal Move Handling',
        solutionPlies: 3,
        tacticalGoal: 'Test Goal',
        tacticalReward: 'win_rook',
        outcomeAdvantage: '+5 Rook',
        learningSummary: 'Great tactical vision!',
        keyTakeaway: 'Always look for forcing moves!',
      };

      const result = analyzePuzzleSolution(invalidPuzzle);

      expect(result).toBeDefined();
      expect(result.detectedTheme).toBe('fork');
      expect(result.advantageSummary).toBeDefined();
      expect(result.stepNarratives).toBeDefined();
      expect(result.isCheckmate).toBe(false);
      // Pure engine architecture (Rule 2 / MAJ-013) produces structured outcomes without I/O or logger side-effects
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // [MAJ-008]: Minimax search deadline and maxNodes abort limits
  // =========================================================================
  describe('[MAJ-008] Minimax engine periodic deadline and maxNodes abort limits', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const engine = new MinimaxEngine();

    it('respects maxNodes limit by terminating search early when node count is reached', async () => {
      const maxNodes = 5;
      const evaluation = await engine.findBestMove(startFen, {
        depth: 4,
        blunderChance: 0,
        maxBlunderScoreDrop: 0,
        evaluationNoise: 0,
        usePst: false,
        useQuiescence: false,
        simulatedThinkTimeMs: [0, 0],
        maxNodes,
      });

      expect(evaluation).toBeDefined();
      expect(evaluation.move).toBeDefined();
      expect(evaluation.nodesEvaluated).toBeLessThanOrEqual(35); // Initial node ordering + aborted search at <= 5 evaluated
    });

    it('respects timeoutMs limit by stopping evaluation before exceeding budget', async () => {
      const startTime = performance.now();
      const evaluation = await engine.findBestMove(startFen, {
        depth: 5,
        blunderChance: 0,
        maxBlunderScoreDrop: 0,
        evaluationNoise: 0,
        usePst: false,
        useQuiescence: false,
        simulatedThinkTimeMs: [0, 0],
        timeoutMs: 1, // 1ms budget
      });

      const elapsed = performance.now() - startTime;
      expect(evaluation).toBeDefined();
      expect(evaluation.move).toBeDefined();
      // Total execution should complete very quickly without running full depth 5
      expect(elapsed).toBeLessThan(1000);
    });

    it('respects deadlineMs limit when an absolute epoch deadline is provided', async () => {
      const pastDeadline = performance.now() - 10;
      const evaluation = await engine.findBestMove(startFen, {
        depth: 4,
        blunderChance: 0,
        maxBlunderScoreDrop: 0,
        evaluationNoise: 0,
        usePst: false,
        useQuiescence: false,
        simulatedThinkTimeMs: [0, 0],
        deadlineMs: pastDeadline,
      });

      expect(evaluation).toBeDefined();
      expect(evaluation.move).toBeDefined();
    });
  });

  // =========================================================================
  // [MAJ-020]: 3-point structured logging on LocalStorageUnifiedStore.overwriteAll
  // =========================================================================
  describe('[MAJ-020] LocalStorageUnifiedStore.overwriteAll 3-point structured logging', () => {
    const validPayload: UnifiedProgressPayload = {
      version: 1,
      exportedAt: Date.now(),
      scenarios: {
        'sc-1': {
          scenarioId: 'sc-1',
          starsEarned: 3,
          attemptsCount: 1,
          hintsUsedTotal: 0,
          firstCompletedAt: 1000,
          lastCompletedAt: 1000,
        },
      },
      puzzles: {
        ratingProfile: {
          rating: 1200,
          ratingDeviation: 150,
          peakRating: 1200,
          totalAttempted: 10,
          totalSolved: 8,
          bestStreak: 4,
          ratingHistory: [],
        },
        themeMastery: {},
        arcadeStats: {
          puzzleRushHighScore: 10,
          puzzleRushBestStreak: 4,
          streakSurvivorHighScore: 5,
          totalRushRuns: 2,
        },
        solvedPuzzles: {
          'p-1': { stars: 3, solvedAt: 1000 },
        },
        createdAt: 1000,
        lastActiveAt: 1000,
      },
    };

    it('logs start and success operations with correlationId and duration on successful overwrite', async () => {
      const mockScenarioStore = {
        getProgressMap: vi.fn().mockResolvedValue({}),
        restoreProgressMap: vi.fn().mockResolvedValue(undefined),
        saveProgress: vi.fn().mockResolvedValue(undefined),
        resetAllProgress: vi.fn().mockResolvedValue(undefined),
      };
      const mockPuzzleStore = {
        getProgress: vi.fn().mockResolvedValue({
          ratingProfile: { rating: 800, ratingDeviation: 350, peakRating: 800, totalAttempted: 0, totalSolved: 0, bestStreak: 0, ratingHistory: [] },
          themeMastery: {},
          arcadeStats: { puzzleRushHighScore: 0, puzzleRushBestStreak: 0, streakSurvivorHighScore: 0, totalRushRuns: 0 },
          solvedPuzzles: {},
          createdAt: 0,
          lastActiveAt: 0,
        }),
        restoreProgress: vi.fn().mockResolvedValue(undefined),
      };

      const infoSpy = vi.spyOn(logger, 'info');
      const store = new LocalStorageUnifiedStore(mockScenarioStore as any, mockPuzzleStore as any);

      await store.overwriteAll(validPayload);

      // Verify Point 1: Operation start
      expect(infoSpy).toHaveBeenCalledWith(
        'Starting unified progress overwrite',
        expect.objectContaining({
          operation: 'unified_store_overwrite_all',
          correlationId: expect.any(String),
        })
      );

      // Verify Point 2: Operation success with duration
      expect(infoSpy).toHaveBeenCalledWith(
        'Unified progress overwrite succeeded',
        expect.objectContaining({
          operation: 'unified_store_overwrite_all',
          correlationId: expect.any(String),
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        })
      );
    });

    it('logs operation start and failure with duration and error context when write fails', async () => {
      const mockScenarioStore = {
        getProgressMap: vi.fn().mockResolvedValue({}),
        restoreProgressMap: vi.fn().mockResolvedValue(undefined),
      };
      const mockPuzzleStore = {
        getProgress: vi.fn().mockResolvedValue({
          ratingProfile: { rating: 800, ratingDeviation: 350, peakRating: 800, totalAttempted: 0, totalSolved: 0, bestStreak: 0, ratingHistory: [] },
          themeMastery: {},
          arcadeStats: { puzzleRushHighScore: 0, puzzleRushBestStreak: 0, streakSurvivorHighScore: 0, totalRushRuns: 0 },
          solvedPuzzles: {},
          createdAt: 0,
          lastActiveAt: 0,
        }),
        restoreProgress: vi.fn().mockRejectedValue(new Error('Disk write failed simulated')),
      };

      const infoSpy = vi.spyOn(logger, 'info');
      const errorSpy = vi.spyOn(logger, 'error');
      const store = new LocalStorageUnifiedStore(mockScenarioStore as any, mockPuzzleStore as any);

      await expect(store.overwriteAll(validPayload)).rejects.toThrow();

      // Point 1: Start logged
      expect(infoSpy).toHaveBeenCalledWith(
        'Starting unified progress overwrite',
        expect.objectContaining({
          operation: 'unified_store_overwrite_all',
        })
      );

      // Point 3: Failure logged with duration & error
      expect(errorSpy).toHaveBeenCalledWith(
        'Unified progress overwrite failed',
        expect.objectContaining({
          operation: 'unified_store_overwrite_all',
          correlationId: expect.any(String),
          duration: expect.any(Number),
          durationMs: expect.any(Number),
          error: expect.any(Object),
        })
      );
    });
  });

  // =========================================================================
  // [MIN-015]: 3-point structured logging on useAiWorker.requestAiMove
  // =========================================================================
  describe('[MIN-015] useAiWorker.requestAiMove 3-point structured logging with duration', () => {
    it('executes structured logging at start and completion with operation: request_ai_move and duration', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      const infoSpy = vi.spyOn(logger, 'info');

      const mockMove = { from: 'e7', to: 'e5', color: 'b' } as Move;
      vi.spyOn(minimaxEngine, 'findBestMove').mockResolvedValue({
        move: { from: 'e7', to: 'e5' },
        score: 10,
        depth: 2,
        nodesEvaluated: 15,
        isBlunder: false,
        searchDurationMs: 8,
      });

      const { requestAiMove } = useAiWorker({ simulateThinkDelay: false });
      const applyMoveFn = vi.fn().mockReturnValue(mockMove);
      const legalFallback = vi.fn().mockReturnValue([mockMove]);

      const result = await requestAiMove(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        'peanut',
        legalFallback,
        applyMoveFn
      );

      expect(result).toEqual({ move: mockMove, isBlunder: false });

      // Start log
      expect(debugSpy).toHaveBeenCalledWith(
        'Starting AI move calculation',
        expect.objectContaining({
          operation: 'request_ai_move',
          correlationId: expect.any(String),
          mascotId: 'peanut',
        })
      );

      // Success log
      expect(infoSpy).toHaveBeenCalledWith(
        'AI move calculation completed successfully',
        expect.objectContaining({
          operation: 'request_ai_move',
          correlationId: expect.any(String),
          mascotId: 'peanut',
          duration: expect.any(Number),
          durationMs: expect.any(Number),
        })
      );
    });

    it('logs error context and duration when AI calculation fails', async () => {
      const debugSpy = vi.spyOn(logger, 'debug');
      const errorSpy = vi.spyOn(logger, 'error');

      const mockMove = { from: 'e7', to: 'e5', color: 'b' } as Move;
      vi.spyOn(minimaxEngine, 'findBestMove').mockRejectedValue(new Error('Engine calculation crash'));

      const { requestAiMove } = useAiWorker({ simulateThinkDelay: false });
      const applyMoveFn = vi.fn().mockReturnValue(mockMove);
      const legalFallback = vi.fn().mockReturnValue([mockMove]);

      await requestAiMove(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        'peanut',
        legalFallback,
        applyMoveFn
      );

      // Start log
      expect(debugSpy).toHaveBeenCalledWith(
        'Starting AI move calculation',
        expect.objectContaining({
          operation: 'request_ai_move',
        })
      );

      // Failure log with duration
      expect(errorSpy).toHaveBeenCalledWith(
        'AI calculation failed, executing emergency fallback move',
        expect.objectContaining({
          operation: 'request_ai_move',
          correlationId: expect.any(String),
          mascotId: 'peanut',
          duration: expect.any(Number),
          durationMs: expect.any(Number),
          error: 'Engine calculation crash',
        })
      );
    });
  });

  // =========================================================================
  // [MIN-026]: LocalStoragePuzzleProgressStore schema validation & sanitization
  // =========================================================================
  describe('[MIN-026] LocalStoragePuzzleProgressStore progress schema sanitization', () => {
    it('sanitizes dirty or corrupt progress storage via defensive parsing and normalization', async () => {
      const corruptStoredData = JSON.stringify({
        ratingProfile: {
          rating: -100, // Invalid: negative rating
          ratingDeviation: 'NaN', // Invalid: string
          peakRating: 'not-a-number', // Invalid: string
          totalAttempted: -5, // Invalid: negative count
        },
        themeMastery: 'invalid-string-theme', // Invalid: not an object
        arcadeStats: null,
      });

      const mockStorage = {
        getItem: vi.fn().mockReturnValue(corruptStoredData),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        isAvailable: vi.fn().mockReturnValue(true),
      };

      const store = new LocalStoragePuzzleProgressStore('test-puzzle-key', mockStorage as any);
      const progress = await store.getProgress();

      expect(progress).toBeDefined();
      // Sanitized to safe clamped defaults
      expect(progress.ratingProfile.rating).toBeGreaterThanOrEqual(500);
      expect(progress.ratingProfile.ratingDeviation).toBeGreaterThanOrEqual(50);
      expect(progress.ratingProfile.peakRating).toBeGreaterThanOrEqual(500);
      expect(progress.ratingProfile.totalAttempted).toBeGreaterThanOrEqual(0);
      expect(typeof progress.themeMastery).toBe('object');
      expect(progress.themeMastery).not.toBeNull();
    });

    it('sanitizeAndValidateProgress from @fun-chess/shared returns sanitized valid payload from dirty input', () => {
      const dirtyInput = {
        version: 1,
        exportedAt: 1000,
        scenarios: {
          'intro-1': {
            scenarioId: 'intro-1',
            starsEarned: 99, // Out of range, should be clamped to 3
            attemptsCount: -1, // Should clamp to >= 1
            hintsUsedTotal: -3, // Should clamp to >= 0
            firstCompletedAt: 1000,
            lastCompletedAt: 1000,
          },
        },
        puzzles: {
          ratingProfile: {
            rating: 4000, // Clamped to 3000 max
            ratingDeviation: 20, // Clamped to 50 min
            peakRating: 4000,
            totalAttempted: 10,
            totalSolved: 8,
            bestStreak: 2,
            ratingHistory: [],
          },
          themeMastery: {},
          arcadeStats: {
            puzzleRushHighScore: 5,
            puzzleRushBestStreak: 2,
            streakSurvivorHighScore: 3,
            totalRushRuns: 1,
          },
          solvedPuzzles: {},
          createdAt: 1000,
          lastActiveAt: 1000,
        },
      };

      const result = sanitizeAndValidateProgress(dirtyInput, 5000);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.scenarios['intro-1']?.starsEarned).toBe(3);
        expect(result.data.puzzles.ratingProfile.rating).toBe(3000);
        expect(result.data.puzzles.ratingProfile.ratingDeviation).toBe(50);
      }
    });
  });

  // =========================================================================
  // [MIN-027]: useCameraStream and useQrDecoder modular decomposition
  // =========================================================================
  describe('[MIN-027] useCameraStream and useQrDecoder composables decomposition', () => {
    it('useCameraStream exposes mediaStream, streaming state, error refs, and lifecycle controls', () => {
      const camera = useCameraStream();

      expect(camera.mediaStream).toBeDefined();
      expect(camera.hasCamera).toBeDefined();
      expect(camera.cameraError).toBeDefined();
      expect(camera.isStreaming).toBeDefined();
      expect(typeof camera.startStream).toBe('function');
      expect(typeof camera.stopStream).toBe('function');
      expect(typeof camera.resetCameraError).toBe('function');
    });

    it('stopMediaStreamTracks stops all tracks on a MediaStream safely', () => {
      const stop1 = vi.fn();
      const stop2 = vi.fn();
      const mockStream = {
        getTracks: vi.fn().mockReturnValue([{ stop: stop1 }, { stop: stop2 }]),
      } as unknown as MediaStream;

      stopMediaStreamTracks(mockStream);

      expect(stop1).toHaveBeenCalledTimes(1);
      expect(stop2).toHaveBeenCalledTimes(1);
    });

    it('useQrDecoder exposes scannedCode, isProcessing, isDecoding, and lifecycle controls', () => {
      const decoder = useQrDecoder();

      expect(decoder.scannedCode).toBeDefined();
      expect(decoder.isProcessing).toBeDefined();
      expect(decoder.isDecoding).toBeDefined();
      expect(typeof decoder.startDecoding).toBe('function');
      expect(typeof decoder.stopDecoding).toBe('function');
      expect(typeof decoder.resetDecoder).toBe('function');
    });
  });

  // =========================================================================
  // [ENH-005]: useAiBoardState seedable PRNG support for resolvePlayerColor
  // =========================================================================
  describe('[ENH-005] useAiBoardState seedable PRNG support for resolvePlayerColor', () => {
    it('deterministically resolves White when seedable randomFn returns < 0.5', () => {
      const deterministicWhiteRng = () => 0.25;
      const { resolvePlayerColor } = useAiBoardState({
        initialPlayerColor: 'random',
        randomFn: deterministicWhiteRng,
      });

      const resolved = resolvePlayerColor('random');
      expect(resolved).toBe('w');
    });

    it('deterministically resolves Black when seedable randomFn returns >= 0.5', () => {
      const deterministicBlackRng = () => 0.75;
      const { resolvePlayerColor } = useAiBoardState({
        initialPlayerColor: 'random',
        randomFn: deterministicBlackRng,
      });

      const resolved = resolvePlayerColor('random');
      expect(resolved).toBe('b');
    });

    it('accepts per-invocation custom random function overriding default option', () => {
      const { resolvePlayerColor } = useAiBoardState({
        initialPlayerColor: 'w',
        randomFn: () => 0.9, // Would normally yield 'b'
      });

      // Pass custom override returning < 0.5 -> yields 'w'
      expect(resolvePlayerColor('random', () => 0.1)).toBe('w');
      // Pass custom override returning >= 0.5 -> yields 'b'
      expect(resolvePlayerColor('random', () => 0.9)).toBe('b');
      // Fixed colors are returned directly without calling RNG
      expect(resolvePlayerColor('w', () => 0.99)).toBe('w');
      expect(resolvePlayerColor('b', () => 0.01)).toBe('b');
    });
  });
});
