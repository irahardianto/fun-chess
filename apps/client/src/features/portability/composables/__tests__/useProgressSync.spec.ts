import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProgressSync } from '../useProgressSync';
import { InMemoryUnifiedStoreMock } from '../../store/in_memory_unified.store.mock';
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
    const mockFileService = {
      downloadProgressFile: vi.fn(),
      readProgressFile: vi.fn(),
    };

    const { exportJson, exportQrString } = useProgressSync({
      storage: mockStorage,
      fileService: mockFileService as any,
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
    const failingFileService = {
      downloadProgressFile: vi.fn().mockImplementation(() => {
        throw new Error('Permission denied');
      }),
      readProgressFile: vi.fn(),
    };

    const { exportJson, syncError } = useProgressSync({
      storage: mockStorage,
      fileService: failingFileService as any,
    });

    await expect(exportJson()).rejects.toThrow('Permission denied');
    expect(syncError.value).toContain('Permission denied');
  });
});
