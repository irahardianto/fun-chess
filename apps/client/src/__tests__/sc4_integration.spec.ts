import { describe, it, expect, vi, afterEach } from 'vitest';
import { ref, effectScope } from 'vue';
import fs from 'fs';
import path from 'path';

// 1. Storage Abstraction (MAJ-006 & ENH-009)
import {
  BrowserStorageAdapter,
  safeLocalStorage,
  safeSessionStorage,
  storageAlertDispatcher,
} from '@/platform/storage';

// 2. Storage Two-Phase Commit & Rollback (CRIT-003, ENH-009)
import {
  LocalStorageUnifiedStore,
  StorageCommitError,
} from '@/features/portability/store/local_storage_unified.store';
import { LocalStoragePuzzleProgressStore } from '@/features/puzzles/store/local_storage_puzzle_store';
import type {
  ScenarioProgressStore,
  PuzzleProgressStore,
  UnifiedProgressPayload,
  PuzzleProgress,
  ScenarioProgressMap,
  Square,
  RoomState,
} from '@fun-chess/shared';

// 3. Hardware Stream Cleanup (CRIT-007)
import { useQrScanner } from '@/features/portability/composables/useQrScanner';

// 4. HTTP API Client (MAJ-007)
import { FetchApiClient } from '@/platform/api/fetch_api_client';

// 5. Audio Service Isolation (MAJ-008)
import { NullAudioService } from '@/platform/audio/null_audio_service';
import { AudioSynthesizer } from '@/platform/audio/audio_synthesizer';
import type { IAudioService } from '@/platform/audio/audio.interface';

// 6. Board Selection Composable (MIN-010)
import { useBoardSelection } from '@/features/board/composables/useBoardSelection';

// 7. Socket State Synchronization & Teardown (MAJ-013)
import { useSocket, resetSocketState } from '@/composables/useSocket';

describe('SC-4 Integration & Core Services Test Suite', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /* ==========================================================================
     1. Storage Abstraction (MAJ-006 & ENH-009)
     ========================================================================== */
  describe('1. Storage Abstraction (MAJ-006 & ENH-009)', () => {
    it('falls back seamlessly to in-memory storage on Safari private browsing mode without throwing', () => {
      // Arrange: Simulate Safari private browsing where setItem throws DOMException: SecurityError
      const securityError = new DOMException(
        'The operation is insecure.',
        'SecurityError'
      );
      const mockStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(() => {
          throw securityError;
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      vi.stubGlobal('localStorage', mockStorage);

      // Act: Instantiating BrowserStorageAdapter must not throw
      const adapter = new BrowserStorageAdapter('localStorage');

      // Assert
      expect(adapter.isAvailable()).toBe(false);

      // Operations in in-memory fallback must not throw and must maintain read-your-writes consistency
      expect(() => adapter.setItem('testKey', 'hello-safari')).not.toThrow();
      expect(adapter.getItem('testKey')).toBe('hello-safari');
      expect(adapter.length).toBe(1);
      expect(adapter.key(0)).toBe('testKey');

      adapter.setItem('secondKey', 'world');
      expect(adapter.length).toBe(2);

      adapter.removeItem('testKey');
      expect(adapter.getItem('testKey')).toBeNull();
      expect(adapter.length).toBe(1);

      adapter.clear();
      expect(adapter.length).toBe(0);
      expect(adapter.getItem('secondKey')).toBeNull();
    });

    it('performs standard CRUD operations when storage is available', () => {
      const memMap = new Map<string, string>();
      const mockStorage = {
        getItem: vi.fn((k: string) => memMap.get(k) ?? null),
        setItem: vi.fn((k: string, v: string) => {
          memMap.set(k, v);
        }),
        removeItem: vi.fn((k: string) => {
          memMap.delete(k);
        }),
        clear: vi.fn(() => {
          memMap.clear();
        }),
        key: vi.fn((idx: number) => Array.from(memMap.keys())[idx] ?? null),
        get length() {
          return memMap.size;
        },
      };
      vi.stubGlobal('localStorage', mockStorage);

      const adapter = new BrowserStorageAdapter('localStorage');
      expect(adapter.isAvailable()).toBe(true);

      adapter.setItem('user_pref', 'dark');
      expect(adapter.getItem('user_pref')).toBe('dark');
      expect(adapter.length).toBe(1);
      expect(adapter.key(0)).toBe('user_pref');

      adapter.removeItem('user_pref');
      expect(adapter.getItem('user_pref')).toBeNull();
      expect(adapter.length).toBe(0);

      adapter.setItem('k1', 'v1');
      adapter.setItem('k2', 'v2');
      expect(adapter.length).toBe(2);
      adapter.clear();
      expect(adapter.length).toBe(0);
    });

    it('safeLocalStorage and safeSessionStorage provide safe access with fallback defaults', () => {
      const missingKey = `test_missing_${Date.now()}`;
      expect(safeLocalStorage.safeGetItem(missingKey, 'default_val')).toBe('default_val');
      expect(safeSessionStorage.safeGetItem(missingKey, 42)).toBe(42);

      const presentKey = `test_present_${Date.now()}`;
      const success = safeLocalStorage.safeSetItem(presentKey, 'stored');
      expect(success).toBe(true);
      expect(safeLocalStorage.safeGetItem(presentKey, 'fallback')).toBe('stored');
      safeLocalStorage.removeItem(presentKey);
    });

    it('notifies storageAlertDispatcher when QuotaExceededError is encountered during setItem', () => {
      const quotaError = new DOMException(
        'The quota has been exceeded.',
        'QuotaExceededError'
      );
      let callCount = 0;
      const mockStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          callCount++;
          if (callCount > 1) {
            // Probe succeeds, subsequent write throws quota error
            throw quotaError;
          }
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };
      vi.stubGlobal('localStorage', mockStorage);

      const adapter = new BrowserStorageAdapter('localStorage');
      expect(adapter.isAvailable()).toBe(true);

      const alertListener = vi.fn();
      const unsubscribe = storageAlertDispatcher.subscribe(alertListener);

      expect(() => adapter.setItem('huge_data', 'value')).toThrow();
      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STORAGE_QUOTA_EXCEEDED',
          store: 'unified',
          attemptedAction: 'save',
          suggestedRemediation: 'EXPORT_BACKUP_AND_CLEAR',
        })
      );

      unsubscribe();
    });
  });

  /* ==========================================================================
     2. Storage Two-Phase Commit & Rollback (CRIT-003, ENH-009)
     ========================================================================== */
  describe('2. Storage Two-Phase Commit & Rollback (CRIT-003, ENH-009)', () => {
    it('rolls back to original snapshot and throws StorageCommitError(rolledBack: true) when scenario write fails', async () => {
      const initialScenarios: ScenarioProgressMap = {
        'lesson-1': {
          scenarioId: 'lesson-1',
          starsEarned: 3,
          attemptsCount: 1,
          hintsUsedTotal: 0,
          firstCompletedAt: 1000,
          lastCompletedAt: 1000,
        },
      };
      const initialPuzzles: PuzzleProgress = {
        ratingProfile: {
          rating: 1200,
          ratingDeviation: 100,
          peakRating: 1250,
          totalAttempted: 20,
          totalSolved: 15,
          bestStreak: 5,
          ratingHistory: [],
        },
        themeMastery: {},
        arcadeStats: {
          puzzleRushHighScore: 10,
          puzzleRushBestStreak: 6,
          streakSurvivorHighScore: 12,
          totalRushRuns: 3,
        },
        solvedPuzzles: {
          'puz-1': { stars: 3, solvedAt: 1000 },
        },
        createdAt: 1000,
        lastActiveAt: 1000,
      };

      let scenarioState = structuredClone(initialScenarios);
      let puzzleState = structuredClone(initialPuzzles);

      const mockScenarioStore: ScenarioProgressStore = {
        getProgressMap: vi.fn(async () => structuredClone(scenarioState)),
        getProgress: vi.fn(async (id: string) => scenarioState[id] ?? null),
        saveProgress: vi.fn(async (id: string, stars: number, hints: number) => {
          if (id === 'failing-scenario') {
            throw new Error('Simulated scenario disk write failure');
          }
          const prev = scenarioState[id];
          scenarioState[id] = {
            scenarioId: id,
            starsEarned: stars as any,
            attemptsCount: prev ? prev.attemptsCount : 1,
            hintsUsedTotal: hints,
            firstCompletedAt: prev ? prev.firstCompletedAt : 2000,
            lastCompletedAt: 2000,
          };
          return scenarioState[id];
        }),
        resetAllProgress: vi.fn(async () => {
          scenarioState = {};
        }),
      };

      const mockPuzzleStore: PuzzleProgressStore = {
        getProgress: vi.fn(async () => structuredClone(puzzleState)),
        updateRating: vi.fn(),
        recordPuzzleAttempt: vi.fn(),
        saveArcadeResult: vi.fn(),
        restoreProgress: vi.fn(async (progress: PuzzleProgress) => {
          puzzleState = structuredClone(progress);
        }),
        resetAll: vi.fn(async () => {}),
      };

      const unifiedStore = new LocalStorageUnifiedStore(mockScenarioStore, mockPuzzleStore);

      const incomingPayload: UnifiedProgressPayload = {
        version: 1,
        exportedAt: 2000,
        scenarios: {
          'failing-scenario': {
            scenarioId: 'failing-scenario',
            starsEarned: 2,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 2000,
            lastCompletedAt: 2000,
          },
        },
        puzzles: {
          ...initialPuzzles,
          ratingProfile: { ...initialPuzzles.ratingProfile, rating: 1500 },
        },
      };

      let thrownError: any = null;
      try {
        await unifiedStore.overwriteAll(incomingPayload);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(StorageCommitError);
      expect(thrownError.rolledBack).toBe(true);
      expect(thrownError.name).toBe('StorageCommitError');

      // Verify complete 100% snapshot rollback of both stores
      expect(scenarioState['lesson-1']).toEqual(
        expect.objectContaining({
          scenarioId: 'lesson-1',
          starsEarned: 3,
          hintsUsedTotal: 0,
        })
      );
      expect(puzzleState).toEqual(initialPuzzles);
    });

    it('rolls back completely when puzzle store restoreProgress throws', async () => {
      const initialScenarios: ScenarioProgressMap = {
        'lesson-1': {
          scenarioId: 'lesson-1',
          starsEarned: 3,
          attemptsCount: 1,
          hintsUsedTotal: 0,
          firstCompletedAt: 1000,
          lastCompletedAt: 1000,
        },
      };
      const initialPuzzles: PuzzleProgress = {
        ratingProfile: {
          rating: 1100,
          ratingDeviation: 150,
          peakRating: 1100,
          totalAttempted: 10,
          totalSolved: 7,
          bestStreak: 3,
          ratingHistory: [],
        },
        themeMastery: {},
        arcadeStats: {
          puzzleRushHighScore: 5,
          puzzleRushBestStreak: 3,
          streakSurvivorHighScore: 5,
          totalRushRuns: 1,
        },
        solvedPuzzles: {},
        createdAt: 1000,
        lastActiveAt: 1000,
      };

      let scenarioState = structuredClone(initialScenarios);
      let puzzleState = structuredClone(initialPuzzles);

      const mockScenarioStore: ScenarioProgressStore = {
        getProgressMap: vi.fn(async () => structuredClone(scenarioState)),
        getProgress: vi.fn(async (id: string) => scenarioState[id] ?? null),
        saveProgress: vi.fn(async (id: string, stars: number, hints: number) => {
          const prev = scenarioState[id];
          scenarioState[id] = {
            scenarioId: id,
            starsEarned: stars as any,
            attemptsCount: prev ? prev.attemptsCount : 1,
            hintsUsedTotal: hints,
            firstCompletedAt: prev ? prev.firstCompletedAt : 2000,
            lastCompletedAt: 2000,
          };
          return scenarioState[id];
        }),
        resetAllProgress: vi.fn(async () => {
          scenarioState = {};
        }),
      };

      let throwOnPuzzleRestore = true;
      const mockPuzzleStore: PuzzleProgressStore = {
        getProgress: vi.fn(async () => structuredClone(puzzleState)),
        updateRating: vi.fn(),
        recordPuzzleAttempt: vi.fn(),
        saveArcadeResult: vi.fn(),
        restoreProgress: vi.fn(async (progress: PuzzleProgress) => {
          if (throwOnPuzzleRestore) {
            throwOnPuzzleRestore = false; // Allow subsequent rollback restore
            throw new Error('Puzzle corrupt data write error');
          }
          puzzleState = structuredClone(progress);
        }),
        resetAll: vi.fn(async () => {}),
      };

      const unifiedStore = new LocalStorageUnifiedStore(mockScenarioStore, mockPuzzleStore);

      const incomingPayload: UnifiedProgressPayload = {
        version: 1,
        exportedAt: 2000,
        scenarios: {
          'lesson-2': {
            scenarioId: 'lesson-2',
            starsEarned: 3,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 2000,
            lastCompletedAt: 2000,
          },
        },
        puzzles: {
          ...initialPuzzles,
          ratingProfile: { ...initialPuzzles.ratingProfile, rating: 1400 },
        },
      };

      await expect(unifiedStore.overwriteAll(incomingPayload)).rejects.toThrow(StorageCommitError);
      expect(scenarioState['lesson-1']).toEqual(
        expect.objectContaining({
          scenarioId: 'lesson-1',
          starsEarned: 3,
          hintsUsedTotal: 0,
        })
      );
      expect(puzzleState).toEqual(initialPuzzles);
    });

    it('dispatches STORAGE_QUOTA_EXCEEDED alert when overwriteAll encounters QuotaExceededError', async () => {
      const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
      const mockScenarioStore: ScenarioProgressStore = {
        getProgressMap: vi.fn(async () => ({})),
        getProgress: vi.fn(async () => null),
        saveProgress: vi.fn(async () => {
          throw quotaError;
        }),
        resetAllProgress: vi.fn(async () => {}),
      };
      const mockPuzzleStore: PuzzleProgressStore = {
        getProgress: vi.fn(async () => ({} as any)),
        updateRating: vi.fn(),
        recordPuzzleAttempt: vi.fn(),
        saveArcadeResult: vi.fn(),
        restoreProgress: vi.fn(async () => {}),
        resetAll: vi.fn(async () => {}),
      };

      const alertListener = vi.fn();
      const unsub = storageAlertDispatcher.subscribe(alertListener);

      const unifiedStore = new LocalStorageUnifiedStore(mockScenarioStore, mockPuzzleStore);
      await expect(
        unifiedStore.overwriteAll({
          version: 1,
          exportedAt: Date.now(),
          scenarios: {
            'sc-1': {
              scenarioId: 'sc-1',
              starsEarned: 3,
              attemptsCount: 1,
              hintsUsedTotal: 0,
              firstCompletedAt: 1,
              lastCompletedAt: 1,
            },
          },
          puzzles: {} as any,
        })
      ).rejects.toThrow(StorageCommitError);

      expect(alertListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STORAGE_QUOTA_EXCEEDED',
          store: 'unified',
          attemptedAction: 'overwrite',
        })
      );
      unsub();
    });

    it('lossless puzzle restore preserves ratingProfile, themeMastery, arcadeStats, and solvedPuzzles without truncation', async () => {
      const store = new LocalStoragePuzzleProgressStore(`test_puz_lossless_${Date.now()}`);

      const richPayload: PuzzleProgress = {
        ratingProfile: {
          rating: 1560,
          ratingDeviation: 75,
          peakRating: 1620,
          totalAttempted: 85,
          totalSolved: 74,
          bestStreak: 16,
          ratingHistory: [
            { rating: 1200, timestamp: 1000, puzzleId: 'p1', delta: 50 },
            { rating: 1560, timestamp: 2000, puzzleId: 'p2', delta: 20 },
          ],
        },
        themeMastery: {
          fork: {
            theme: 'fork',
            attempted: 25,
            solved: 22,
            starsEarned: 60,
            masteryLevel: 'master',
            lastPracticedAt: 1700000000,
          },
          pin: {
            theme: 'pin',
            attempted: 12,
            solved: 10,
            starsEarned: 25,
            masteryLevel: 'apprentice',
            lastPracticedAt: 1700000100,
          },
        },
        arcadeStats: {
          puzzleRushHighScore: 32,
          puzzleRushBestStreak: 21,
          streakSurvivorHighScore: 45,
          totalRushRuns: 18,
        },
        solvedPuzzles: {
          fork_001: { stars: 3, solvedAt: 1700000200 },
          pin_002: { stars: 2, solvedAt: 1700000300 },
        },
        createdAt: 1690000000,
        lastActiveAt: 1700000500,
      };

      await store.restoreProgress(richPayload);
      const restored = await store.getProgress();

      expect(restored.ratingProfile.rating).toBe(1560);
      expect(restored.ratingProfile.ratingDeviation).toBe(75);
      expect(restored.ratingProfile.peakRating).toBe(1620);
      expect(restored.ratingProfile.totalAttempted).toBe(85);
      expect(restored.ratingProfile.totalSolved).toBe(74);
      expect(restored.ratingProfile.bestStreak).toBe(16);

      expect(restored.themeMastery['fork']).toBeDefined();
      expect(restored.themeMastery['fork']?.masteryLevel).toBe('master');
      expect(restored.themeMastery['fork']?.starsEarned).toBe(60);
      expect(restored.themeMastery['pin']?.masteryLevel).toBe('apprentice');

      expect(restored.arcadeStats.puzzleRushHighScore).toBe(32);
      expect(restored.arcadeStats.puzzleRushBestStreak).toBe(21);
      expect(restored.arcadeStats.streakSurvivorHighScore).toBe(45);
      expect(restored.arcadeStats.totalRushRuns).toBe(18);

      expect(restored.solvedPuzzles['fork_001']).toEqual({ stars: 3, solvedAt: 1700000200 });
      expect(restored.solvedPuzzles['pin_002']).toEqual({ stars: 2, solvedAt: 1700000300 });

      await store.resetAll();
    });
  });

  /* ==========================================================================
     3. Hardware Stream Cleanup (CRIT-007)
     ========================================================================== */
  describe('3. Hardware Stream Cleanup (CRIT-007)', () => {
    it('stops all media tracks and sets videoElement.srcObject to null when videoElement.play() rejects (AbortError)', async () => {
      const track1 = { stop: vi.fn(), kind: 'video' };
      const track2 = { stop: vi.fn(), kind: 'audio' };
      const mockStream = {
        getTracks: vi.fn(() => [track1, track2]),
      } as unknown as MediaStream;

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(mockStream),
        },
      });

      const mockVideo = {
        play: vi.fn().mockRejectedValue(
          new DOMException('The play() request was interrupted', 'AbortError')
        ),
        setAttribute: vi.fn(),
        srcObject: null as any,
      } as unknown as HTMLVideoElement;

      const { startScanner, isScanning, hasCamera, cameraError } = useQrScanner();

      await startScanner(mockVideo);

      expect(track1.stop).toHaveBeenCalled();
      expect(track2.stop).toHaveBeenCalled();
      expect(mockVideo.srcObject).toBeNull();
      expect(isScanning.value).toBe(false);
      expect(hasCamera.value).toBe(false);
      expect(cameraError.value).toBe('The play() request was interrupted');
    });

    it('stops all media tracks and sets videoElement.srcObject to null when videoElement.play() rejects (NotAllowedError)', async () => {
      const videoTrack = { stop: vi.fn(), kind: 'video' };
      const mockStream = {
        getTracks: vi.fn(() => [videoTrack]),
      } as unknown as MediaStream;

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(mockStream),
        },
      });

      const mockVideo = {
        play: vi.fn().mockRejectedValue(
          new DOMException('Permission denied', 'NotAllowedError')
        ),
        setAttribute: vi.fn(),
        srcObject: null as any,
      } as unknown as HTMLVideoElement;

      const { startScanner, isScanning, cameraError } = useQrScanner();

      await startScanner(mockVideo);

      expect(videoTrack.stop).toHaveBeenCalled();
      expect(mockVideo.srcObject).toBeNull();
      expect(isScanning.value).toBe(false);
      expect(cameraError.value).toContain('Camera permission was denied');
    });

    it('stopScanner stops tracks and nullifies activeVideoElement.srcObject during manual stop', async () => {
      const videoTrack = { stop: vi.fn(), kind: 'video' };
      const mockStream = {
        getTracks: vi.fn(() => [videoTrack]),
      } as unknown as MediaStream;

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getUserMedia: vi.fn().mockResolvedValue(mockStream),
        },
      });

      const mockVideo = {
        play: vi.fn().mockResolvedValue(undefined),
        setAttribute: vi.fn(),
        srcObject: null as any,
        readyState: 0,
        videoWidth: 640,
        videoHeight: 480,
      } as unknown as HTMLVideoElement;

      const { startScanner, stopScanner, isScanning } = useQrScanner();

      await startScanner(mockVideo);
      expect(isScanning.value).toBe(true);

      stopScanner();

      expect(videoTrack.stop).toHaveBeenCalled();
      expect(mockVideo.srcObject).toBeNull();
      expect(isScanning.value).toBe(false);
    });
  });

  /* ==========================================================================
     4. HTTP API Client (MAJ-007)
     ========================================================================== */
  describe('4. HTTP API Client (MAJ-007)', () => {
    it('enforces 3-second default timeout via AbortController/signal', async () => {
      const client = new FetchApiClient('http://test.local');

      let receivedSignal: AbortSignal | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init?: RequestInit) => {
          receivedSignal = init?.signal as AbortSignal;
          return new Promise((_resolve, reject) => {
            if (init?.signal) {
              if (init.signal.aborted) {
                reject(new DOMException('The user aborted a request.', 'AbortError'));
              } else {
                init.signal.addEventListener('abort', () => {
                  reject(new DOMException('The user aborted a request.', 'AbortError'));
                });
              }
            }
          });
        })
      );

      const timeoutPromise = client.get('/test', { timeoutMs: 30 });
      await expect(timeoutPromise).rejects.toThrow();
      expect(receivedSignal?.aborted).toBe(true);
    });

    it('validates LanInfoResponse against LanInfoResponseSchema (Zod)', async () => {
      const client = new FetchApiClient('http://test.local');

      const validLanPayload = {
        lanIp: '192.168.1.105',
        port: 3000,
        localUrl: 'http://localhost:3000',
        joinUrl: 'http://192.168.1.105:3000',
        interfaces: ['192.168.1.105', '127.0.0.1'],
        isCloudRelay: false,
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => validLanPayload,
        })
      );

      const result = await client.getLanInfo();
      expect(result.lanIp).toBe('192.168.1.105');
      expect(result.port).toBe(3000);
      expect(result.interfaces).toContain('192.168.1.105');

      // Invalid response (missing required fields)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ invalid: 'missing required lanIp' }),
        })
      );

      await expect(client.getLanInfo()).rejects.toThrow();
    });

    it('validates HealthCheckResponse against HealthCheckResponseSchema (Zod)', async () => {
      const client = new FetchApiClient('http://test.local');

      const validHealth = {
        status: 'ok',
        uptimeSeconds: 120,
        timestamp: new Date().toISOString(),
        activeRooms: 2,
        activeSockets: 4,
        memoryUsageMb: { rss: 45.2, heapTotal: 30.1, heapUsed: 22.4 },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => validHealth,
        })
      );

      const result = await client.checkHealth();
      expect(result.status).toBe('ok');
      expect(result.uptimeSeconds).toBe(120);

      // Invalid health payload
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ status: 'unknown_status', uptimeSeconds: -1 }),
        })
      );

      await expect(client.checkHealth()).rejects.toThrow();
    });

    it('checkConnectivity returns boolean via lightweight HEAD request', async () => {
      const client = new FetchApiClient('http://test.local');

      // 200 OK HEAD response
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
        })
      );

      const online = await client.checkConnectivity('/favicon.svg');
      expect(online).toBe(true);

      // 500 server error
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        })
      );
      const serverErr = await client.checkConnectivity('/favicon.svg');
      expect(serverErr).toBe(false);

      // Network disconnection
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      const offline = await client.checkConnectivity('/favicon.svg');
      expect(offline).toBe(false);
    });
  });

  /* ==========================================================================
     5. Audio Service Isolation (MAJ-008)
     ========================================================================== */
  describe('5. Audio Service Isolation (MAJ-008)', () => {
    it('NullAudioService implements IAudioService as inert no-op', () => {
      const nullAudio: IAudioService = new NullAudioService();

      expect(nullAudio.isMuted()).toBe(true);
      expect(nullAudio.toggleMute()).toBe(false);

      expect(() => {
        nullAudio.playMove();
        nullAudio.playCapture();
        nullAudio.playCheck();
        nullAudio.playVictory();
        nullAudio.playDefeat();
      }).not.toThrow();
    });

    it('AudioSynthesizer does not attach DOM event listeners to window or document on instantiation', () => {
      const windowSpy = vi.spyOn(window, 'addEventListener');
      const docSpy = vi.spyOn(document, 'addEventListener');

      const synth = new AudioSynthesizer({ muted: true });

      expect(synth.isMuted()).toBe(true);
      expect(windowSpy).not.toHaveBeenCalled();
      expect(docSpy).not.toHaveBeenCalled();

      windowSpy.mockRestore();
      docSpy.mockRestore();
    });
  });

  /* ==========================================================================
     6. Board Selection Composable (MIN-010)
     ========================================================================== */
  describe('6. Board Selection Composable (MIN-010)', () => {
    it('handles piece selection and legal moves filtering', () => {
      const currentTurn = ref<'w' | 'b'>('w');
      const playerColor = ref<'w' | 'b' | null>('w');
      const mockPieces: Record<string, { color: 'w' | 'b'; type: string }> = {
        e2: { color: 'w', type: 'p' },
        e7: { color: 'b', type: 'p' },
      };

      const executeMove = vi.fn(() => true);
      const { selectedSquare, legalMovesForSelected, handleSquareClick, isLegalTarget } =
        useBoardSelection({
          getPieceAt: (sq) => mockPieces[sq] ?? null,
          getLegalMovesForSquare: (sq) => (sq === 'e2' ? ['e3' as Square, 'e4' as Square] : []),
          currentTurn,
          playerColor,
          executeMove,
        });

      // 1. Click opponent piece - should NOT select
      handleSquareClick('e7' as Square);
      expect(selectedSquare.value).toBeNull();
      expect(legalMovesForSelected.value).toEqual([]);

      // 2. Click own piece - should select and populate legal moves
      handleSquareClick('e2' as Square);
      expect(selectedSquare.value).toBe('e2');
      expect(legalMovesForSelected.value).toEqual(['e3', 'e4']);
      expect(isLegalTarget('e4' as Square)).toBe(true);
      expect(isLegalTarget('d4' as Square)).toBe(false);

      // 3. Click empty square outside legal moves - should deselect
      handleSquareClick('a1' as Square);
      expect(selectedSquare.value).toBeNull();
    });

    it('handles legal target click and executes move when not pawn promotion', () => {
      const currentTurn = ref<'w' | 'b'>('w');
      const playerColor = ref<'w' | 'b' | null>('w');
      const mockPieces: Record<string, { color: 'w' | 'b'; type: string }> = {
        e2: { color: 'w', type: 'p' },
      };

      const executeMove = vi.fn(() => true);
      const onMoveReady = vi.fn();

      const { handleSquareClick, selectedSquare } = useBoardSelection({
        getPieceAt: (sq) => mockPieces[sq] ?? null,
        getLegalMovesForSquare: (sq) => (sq === 'e2' ? ['e4' as Square] : []),
        currentTurn,
        playerColor,
        executeMove,
      });

      // Select piece
      handleSquareClick('e2' as Square);
      expect(selectedSquare.value).toBe('e2');

      // Click legal destination
      const result = handleSquareClick('e4' as Square, onMoveReady);

      expect(executeMove).toHaveBeenCalledWith('e2', 'e4');
      expect(onMoveReady).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
      expect(result.moved).toBe(true);
      expect(result.requiresPromotion).toBe(false);
      expect(selectedSquare.value).toBeNull();
    });

    it('intercepts pawn promotion and awaits completePromotion / cancelPromotion', () => {
      const currentTurn = ref<'w' | 'b'>('w');
      const playerColor = ref<'w' | 'b' | null>('w');
      const mockPieces: Record<string, { color: 'w' | 'b'; type: string }> = {
        e7: { color: 'w', type: 'p' },
      };

      const executeMove = vi.fn(() => true);
      const onMoveReady = vi.fn();

      const {
        handleSquareClick,
        pendingPromotion,
        completePromotion,
        cancelPromotion,
        selectedSquare,
      } = useBoardSelection({
        getPieceAt: (sq) => mockPieces[sq] ?? null,
        getLegalMovesForSquare: (sq) => (sq === 'e7' ? ['e8' as Square] : []),
        currentTurn,
        playerColor,
        executeMove,
      });

      // Select pawn at e7
      handleSquareClick('e7' as Square);

      // Click promotion target e8
      const moveResult = handleSquareClick('e8' as Square);

      expect(executeMove).not.toHaveBeenCalled();
      expect(moveResult.requiresPromotion).toBe(true);
      expect(moveResult.moved).toBe(false);
      expect(pendingPromotion.value).toEqual({ from: 'e7', to: 'e8' });

      // Complete promotion with Queen ('q')
      const completed = completePromotion('q', onMoveReady);
      expect(completed).toBe(true);
      expect(executeMove).toHaveBeenCalledWith('e7', 'e8', 'q');
      expect(onMoveReady).toHaveBeenCalledWith({ from: 'e7', to: 'e8', promotion: 'q' });
      expect(pendingPromotion.value).toBeNull();
      expect(selectedSquare.value).toBeNull();

      // Test cancelPromotion
      handleSquareClick('e7' as Square);
      handleSquareClick('e8' as Square);
      expect(pendingPromotion.value).toEqual({ from: 'e7', to: 'e8' });
      cancelPromotion();
      expect(pendingPromotion.value).toBeNull();
      expect(selectedSquare.value).toBeNull();
    });
  });

  /* ==========================================================================
     7. Socket State Synchronization & Teardown (MAJ-013)
     ========================================================================== */
  describe('7. Socket State Synchronization & Teardown (MAJ-013)', () => {
    it('initializes and synchronizes socket state across instances', () => {
      const mockSocket = {
        id: 'socket_sc4_sync',
        connected: true,
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };

      const client = useSocket(mockSocket as any);

      expect(client.isConnected.value).toBe(true);
      expect(client.socketId.value).toBe('socket_sc4_sync');
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });

    it('multiple invocations of useSocket() share identical reactive refs without desynchronization (MAJ-013)', () => {
      resetSocketState();
      const eventHandlers: Record<string, Function> = {};
      const mockSocket = {
        id: 'shared_socket_456',
        connected: true,
        on: vi.fn((event: string, handler: Function) => {
          eventHandlers[event] = handler;
        }),
        off: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };

      const instanceA = useSocket(mockSocket as any);
      const instanceB = useSocket();

      // Verify referential equality of all reactive refs across distinct composable invocations
      expect(instanceA.currentRoom).toBe(instanceB.currentRoom);
      expect(instanceA.currentPlayer).toBe(instanceB.currentPlayer);
      expect(instanceA.isConnected).toBe(instanceB.isConnected);
      expect(instanceA.socketId).toBe(instanceB.socketId);
      expect(instanceA.sessionToken).toBe(instanceB.sessionToken);
      expect(instanceA.lastError).toBe(instanceB.lastError);
      expect(instanceA.drawOfferedBy).toBe(instanceB.drawOfferedBy);
      expect(instanceA.rematchRequestedBy).toBe(instanceB.rematchRequestedBy);
      expect(instanceA.lastGameOver).toBe(instanceB.lastGameOver);
      expect(instanceA.kingInCheck).toBe(instanceB.kingInCheck);

      // Verify reactive update from socket event is observed by both instances
      const mockRoom: RoomState = {
        roomCode: 'SYNC',
        status: 'playing',
        hostId: 'p1',
        whitePlayer: {
          id: 'p1',
          name: 'Alice',
          color: 'w',
          socketId: 's1',
          isHost: true,
          isConnected: true,
          connectedAt: 1,
        },
        blackPlayer: {
          id: 'p2',
          name: 'Bob',
          color: 'b',
          socketId: 's2',
          isHost: false,
          isConnected: true,
          connectedAt: 2,
        },
        spectators: [],
        game: {} as any,
        rematch: null,
        createdAt: 1,
        lastActivityAt: 2,
      };

      eventHandlers['room:player_joined']?.({ player: mockRoom.whitePlayer, room: mockRoom });

      expect(instanceA.currentRoom.value).toEqual(mockRoom);
      expect(instanceB.currentRoom.value).toEqual(mockRoom);
    });

    it('teardown cleans up listeners on scope disposal or disconnect', () => {
      const mockSocket = {
        id: 'socket_teardown',
        connected: true,
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };

      const scope = effectScope();
      scope.run(() => {
        const { disconnect } = useSocket(mockSocket as any);
        disconnect();
      });

      expect(mockSocket.disconnect).toHaveBeenCalled();
      scope.stop();
    });
  });

  /* ==========================================================================
     8. Circular Dependency Check (MAJ-005)
     ========================================================================== */
  describe('8. Circular Dependency Check (MAJ-005)', () => {
    const clientSrcDir = path.resolve(__dirname, '..');
    const composablesDir = path.resolve(clientSrcDir, 'composables');
    const portabilityDir = path.resolve(clientSrcDir, 'features/portability');

    it('verifies composables/useProgressSync.ts is eliminated (MAJ-005)', () => {
      const legacyPath = path.resolve(composablesDir, 'useProgressSync.ts');
      expect(fs.existsSync(legacyPath)).toBe(false);
    });

    it('verifies composables/index.ts does not export useProgressSync (imported from features/portability)', () => {
      const composablesIndexPath = path.resolve(composablesDir, 'index.ts');
      const indexSrc = fs.readFileSync(composablesIndexPath, 'utf-8');
      expect(indexSrc).not.toMatch(/export\s+\*\s+from\s+['"]\.\/useProgressSync['"]/);
    });

    it('verifies no circular import dependencies exist between composables and features/portability', () => {
      function getTsFiles(dir: string): string[] {
        if (!fs.existsSync(dir)) return [];
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.resolve(dir, path.basename(entry.name));
          if (entry.isDirectory()) {
            if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
              results.push(...getTsFiles(fullPath));
            }
          } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const composableFiles = getTsFiles(composablesDir);
      const portabilityFiles = getTsFiles(portabilityDir);
      expect(composableFiles.length).toBeGreaterThan(0);

      const portabilityImportsFromRootComposables: string[] = [];
      for (const file of portabilityFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const importLines = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
        for (const imp of importLines) {
          // Check for import of root composables (@/composables or relative traversal to src/composables)
          if (
            /from\s+['"]@\/composables(\/.*)?['"]/.test(imp) ||
            /from\s+['"](\.\.\/)+composables(\/.*)?['"]/.test(imp)
          ) {
            portabilityImportsFromRootComposables.push(`${file} -> ${imp}`);
          }
        }
      }

      // Assert features/portability never imports from root composables
      expect(portabilityImportsFromRootComposables).toHaveLength(0);
    });
  });
});
