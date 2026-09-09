import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProgressSync } from '../useProgressSync';
import { InMemoryUnifiedStoreMock } from '../../store/in_memory_unified.store.mock';
import type { IProgressFileService } from '../../services/progress_file.service';
import type { UnifiedProgressPayload } from '@fun-chess/shared';

describe('useProgressSync Composable', () => {
  let mockStorage: InMemoryUnifiedStoreMock;
  const samplePayload: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 1000,
    scenarios: {
      'lesson-1': {
        scenarioId: 'lesson-1',
        starsEarned: 2,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1000,
        lastCompletedAt: 1000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: 1000,
        ratingDeviation: 200,
        peakRating: 1050,
        totalAttempted: 10,
        totalSolved: 8,
        bestStreak: 4,
        ratingHistory: [],
      },
      themeMastery: {},
      arcadeStats: {
        puzzleRushHighScore: 10,
        puzzleRushBestStreak: 5,
        streakSurvivorHighScore: 8,
        totalRushRuns: 3,
      },
      solvedPuzzles: {},
      createdAt: 1000,
      lastActiveAt: 1000,
    },
  };

  beforeEach(() => {
    mockStorage = new InMemoryUnifiedStoreMock(samplePayload);
  });

  it('loads current progress from storage', async () => {
    const { loadCurrentProgress, currentProgress } = useProgressSync({
      storage: mockStorage,
    });

    const result = await loadCurrentProgress();
    expect(result.puzzles.ratingProfile.rating).toBe(1000);
    expect(currentProgress.value?.puzzles.ratingProfile.rating).toBe(1000);
  });

  it('exports JSON and QR string correctly', async () => {
    const mockFileService: IProgressFileService = {
      downloadProgressFile: vi.fn(),
      readProgressFile: vi.fn(),
    };

    const { exportJson, exportQrString } = useProgressSync({
      storage: mockStorage,
      fileService: mockFileService,
    });

    const json = await exportJson('test.json');
    expect(json).toContain('FC_PROGRESS_V1');
    expect(mockFileService.downloadProgressFile).toHaveBeenCalledWith(json, 'test.json');

    const qr = await exportQrString();
    expect(qr.startsWith('FC1:')).toBe(true);
  });

  it('imports valid QR string and detects diff conflicts', async () => {
    const { importPayload, isConflictModalOpen, diffPreview, incomingPayload } = useProgressSync({
      storage: mockStorage,
    });

    // Create incoming payload with higher rating
    const higherPayload: UnifiedProgressPayload = {
      ...samplePayload,
      puzzles: {
        ...samplePayload.puzzles,
        ratingProfile: {
          ...samplePayload.puzzles.ratingProfile,
          rating: 1400,
          peakRating: 1400,
        },
      },
    };

    const { encodeProgressToQr } = await import('@fun-chess/shared');
    const qrString = await encodeProgressToQr(higherPayload);

    const autoMerged = await importPayload(qrString);

    expect(autoMerged).toBe(false); // differences found -> open modal
    expect(isConflictModalOpen.value).toBe(true);
    expect(incomingPayload.value?.puzzles.ratingProfile.rating).toBe(1400);
    expect(diffPreview.value?.puzzles.incomingRating).toBe(1400);
    expect(diffPreview.value?.puzzles.localRating).toBe(1000);
  });

  it('executes smart merge and updates storage', async () => {
    const { importPayload, executeMerge, currentProgress } = useProgressSync({
      storage: mockStorage,
    });

    const incomingData: UnifiedProgressPayload = {
      ...samplePayload,
      scenarios: {
        'lesson-1': {
          scenarioId: 'lesson-1',
          starsEarned: 3,
          attemptsCount: 2,
          hintsUsedTotal: 1,
          firstCompletedAt: 1000,
          lastCompletedAt: 2000,
        },
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
        ...samplePayload.puzzles,
        ratingProfile: {
          ...samplePayload.puzzles.ratingProfile,
          rating: 1250,
          peakRating: 1250,
        },
      },
    };

    const { encodeProgressToEnvelope } = await import('@fun-chess/shared');
    const json = encodeProgressToEnvelope(incomingData);

    await importPayload(json);

    const merged = await executeMerge('smart_merge');
    expect(merged.puzzles.ratingProfile.rating).toBe(1250);
    expect(merged.scenarios['lesson-1']?.starsEarned).toBe(3);
    expect(merged.scenarios['lesson-2']?.starsEarned).toBe(3);
    expect(currentProgress.value?.puzzles.ratingProfile.rating).toBe(1250);

    // Calling executeMerge again after incomingPayload is consumed should be idempotent and not throw
    const secondCallResult = await executeMerge('smart_merge');
    expect(secondCallResult).toEqual(merged);
  });

  it('handles corrupted or invalid inputs with kid-friendly error', async () => {
    const { importPayload, syncError } = useProgressSync({
      storage: mockStorage,
    });

    const result = await importPayload('not_a_valid_save_data');
    expect(result).toBe(false);
    expect(syncError.value).toBeDefined();
  });

  it('sets actionable error message when loadCurrentProgress fails', async () => {
    const failingStorage = {
      getUnifiedProgress: vi.fn().mockRejectedValue(new Error('Storage disk full')),
      saveUnifiedProgress: vi.fn(),
    };

    const { loadCurrentProgress, syncError } = useProgressSync({
      storage: failingStorage,
    });

    await expect(loadCurrentProgress()).rejects.toThrow('Storage disk full');
    expect(syncError.value).toBe('Unable to load progress. Refresh the page to try again.');
  });

  it('sets actionable error message when exportJson fails', async () => {
    const failingFileService: IProgressFileService = {
      downloadProgressFile: vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      }),
      readProgressFile: vi.fn(),
    };

    const { exportJson, syncError } = useProgressSync({
      storage: mockStorage,
      fileService: failingFileService,
    });

    await expect(exportJson()).rejects.toThrow('Permission denied');
    expect(syncError.value).toContain('Permission denied');
  });

  it('rejects import payload exceeding 2MB limit and sets syncError (MIN-032)', async () => {
    const { importPayload, syncError } = useProgressSync({
      storage: mockStorage,
    });

    const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
    const result = await importPayload(oversized);

    expect(result).toBe(false);
    expect(syncError.value).toBe('Save data exceeds maximum allowed size of 2MB.');
  });

  it('rejects empty or invalid input with actionable error message (MIN-032)', async () => {
    const { importPayload, syncError } = useProgressSync({
      storage: mockStorage,
    });

    const result = await importPayload('');
    expect(result).toBe(false);
    expect(syncError.value).toBe('Select a valid save file (.json) or scan a QR code.');
  });

  it('sets syncError reactivity and rethrows when QR export generation fails (MAJ-019)', async () => {
    const failingCodec = {
      encodeToQrString: vi.fn().mockRejectedValue(new Error('QR compression buffer overflow')),
      decodeFromQrString: vi.fn(),
      encodeToEnvelopeJson: vi.fn(),
      decodeFromEnvelopeJson: vi.fn(),
    };

    const { exportQrString, syncError } = useProgressSync({
      storage: mockStorage,
      codec: failingCodec as any,
    });

    await expect(exportQrString()).rejects.toThrow('QR compression buffer overflow');
    expect(syncError.value).toBe('QR compression buffer overflow');
  });

  it('handles corrupted JSON payload parsing with warning and sets syncError reactivity (MAJ-019)', async () => {
    const { importPayload, syncError } = useProgressSync({
      storage: mockStorage,
    });

    const result = await importPayload('{ bad_json: undefined, "unclosed": [');
    expect(result).toBe(false);
    expect(syncError.value).toBe('Invalid JSON format in save data.');
  });

  it('sets syncError reactivity and rethrows when storage write fails during executeMerge (MAJ-019)', async () => {
    const failingStorage = {
      getUnifiedProgress: vi.fn().mockResolvedValue(samplePayload),
      saveUnifiedProgress: vi.fn().mockRejectedValue(new Error('IndexedDB quota exceeded')),
    };

    const { importPayload, executeMerge, syncError } = useProgressSync({
      storage: failingStorage,
    });

    const validJson = JSON.stringify(samplePayload);
    await importPayload(validJson);

    await expect(executeMerge('replace_local')).rejects.toThrow('IndexedDB quota exceeded');
    expect(syncError.value).toBe('IndexedDB quota exceeded');
  });

  it('logs warning and safely completes merge when celebration trigger fails (MAJ-019)', async () => {
    const failingConfetti = {
      celebrateVictory: vi.fn().mockImplementation(() => {
        throw new Error('Canvas not supported');
      }),
    };

    const { executeMerge, syncError } = useProgressSync({
      storage: mockStorage,
      confetti: failingConfetti as any,
    });

    const merged = await executeMerge('smart_merge');
    expect(merged).toBeDefined();
    expect(syncError.value).toBeNull();
  });

  describe('Modal and UI State Management', () => {
    it('manages sync and conflict modal visibility and error clearing', async () => {
      const {
        openSyncModal,
        closeSyncModal,
        openConflictModal,
        closeConflictModal,
        clearError,
        isSyncModalOpen,
        isConflictModalOpen,
        syncError,
      } = useProgressSync({ storage: mockStorage });

      expect(isSyncModalOpen.value).toBe(false);
      openSyncModal();
      expect(isSyncModalOpen.value).toBe(true);

      closeSyncModal();
      expect(isSyncModalOpen.value).toBe(false);

      expect(isConflictModalOpen.value).toBe(false);
      openConflictModal();
      expect(isConflictModalOpen.value).toBe(true);

      closeConflictModal();
      expect(isConflictModalOpen.value).toBe(false);

      syncError.value = 'temporary error';
      clearError();
      expect(syncError.value).toBeNull();
    });

    it('triggers onMergeCelebration callback when merge strategy succeeds', async () => {
      const onMergeCelebration = vi.fn();
      const { importPayload, executeMerge } = useProgressSync({
        storage: mockStorage,
        onMergeCelebration,
      });

      const validJson = JSON.stringify(samplePayload);
      await importPayload(validJson);
      await executeMerge('smart_merge');

      expect(onMergeCelebration).toHaveBeenCalledTimes(1);
    });

    it('does not trigger celebration when keep_local strategy is chosen', async () => {
      const onMergeCelebration = vi.fn();
      const { importPayload, executeMerge } = useProgressSync({
        storage: mockStorage,
        onMergeCelebration,
      });

      const validJson = JSON.stringify(samplePayload);
      await importPayload(validJson);
      await executeMerge('keep_local');

      expect(onMergeCelebration).not.toHaveBeenCalled();
    });

    it('uses cached currentProgress for exportJson and exportQrString when already loaded', async () => {
      const mockFileService: IProgressFileService = {
        downloadProgressFile: vi.fn(),
        readProgressFile: vi.fn(),
      };

      const { loadCurrentProgress, exportJson, exportQrString } = useProgressSync({
        storage: mockStorage,
        fileService: mockFileService,
      });

      // Pre-load progress
      await loadCurrentProgress();

      // Subsequent exports should utilize cached progress
      const json = await exportJson('cached.json');
      expect(json).toBeDefined();

      const qr = await exportQrString();
      expect(qr.startsWith('FC1:')).toBe(true);
    });
  });
});
