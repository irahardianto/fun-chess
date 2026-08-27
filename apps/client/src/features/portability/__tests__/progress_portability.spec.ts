import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DefaultProgressCodec,
  DefaultProgressMergeEngine,
  type UnifiedProgressPayload,
} from '@fun-chess/shared';
import { ProgressFileService } from '../services/progress_file.service';
import { InMemoryUnifiedStoreMock } from '../store/in_memory_unified.store.mock';

describe('Progress Portability End-to-End Workflow', () => {
  const codec = new DefaultProgressCodec();
  const mergeEngine = new DefaultProgressMergeEngine();
  const fileService = new ProgressFileService();

  const mockPayload: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 1700000000000,
    clientVersion: '1.0.0',
    scenarios: {
      'lesson_intro_1': {
        scenarioId: 'lesson_intro_1',
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1700000000000,
        lastCompletedAt: 1700000000000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: 1280,
        ratingDeviation: 85,
        peakRating: 1320,
        totalAttempted: 30,
        totalSolved: 25,
        bestStreak: 9,
        ratingHistory: [],
      },
      themeMastery: {
        fork: {
          theme: 'fork',
          attempted: 10,
          solved: 9,
          starsEarned: 18,
          masteryLevel: 'apprentice',
          lastPracticedAt: 1700000000000,
        },
      },
      arcadeStats: {
        puzzleRushHighScore: 21,
        puzzleRushBestStreak: 10,
        streakSurvivorHighScore: 14,
        totalRushRuns: 5,
      },
      solvedPuzzles: {
        'puz_001': {
          stars: 3,
          solvedAt: 1700000000000,
        },
      },
      createdAt: 1699000000000,
      lastActiveAt: 1700000000000,
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('performs full round-trip export to JSON file envelope and import restore', async () => {
    // 1. Arrange: Store with source payload
    const sourceStore = new InMemoryUnifiedStoreMock(mockPayload);
    const destinationStore = new InMemoryUnifiedStoreMock({
      version: 1,
      exportedAt: 0,
      scenarios: {},
      puzzles: {
        ratingProfile: { rating: 800, ratingDeviation: 350, peakRating: 800, totalAttempted: 0, totalSolved: 0, bestStreak: 0, ratingHistory: [] },
        themeMastery: {},
        arcadeStats: { puzzleRushHighScore: 0, puzzleRushBestStreak: 0, streakSurvivorHighScore: 0, totalRushRuns: 0 },
        solvedPuzzles: {},
        createdAt: 0,
        lastActiveAt: 0,
      },
    });

    // 2. Act: Export to JSON envelope
    const dataToExport = await sourceStore.getUnifiedProgress();
    const envelopeJson = codec.encodeToEnvelopeJson(dataToExport);

    // Read back via file service reader
    const mockFile = new File([envelopeJson], 'funchess-save.json', { type: 'application/json' });
    const readEnvelopeString = await fileService.readProgressFile(mockFile);
    const decodedPayload = codec.decodeFromEnvelopeJson(readEnvelopeString);

    // Apply smart merge onto destination store
    const localDestData = await destinationStore.getUnifiedProgress();
    const merged = mergeEngine.merge(localDestData, decodedPayload, 'smart_merge');
    await destinationStore.saveUnifiedProgress(merged);

    // 3. Assert
    const finalData = await destinationStore.getUnifiedProgress();
    expect(finalData.puzzles.ratingProfile.rating).toBe(1280);
    expect(finalData.puzzles.arcadeStats.puzzleRushHighScore).toBe(21);
    expect(finalData.scenarios['lesson_intro_1']?.starsEarned).toBe(3);
  });

  it('performs full round-trip QR encoding and decoding across devices', async () => {
    // 1. Arrange
    const sourceStore = new InMemoryUnifiedStoreMock(mockPayload);
    const dataToExport = await sourceStore.getUnifiedProgress();

    // 2. Act: Encode to compact QR string
    const qrString = await codec.encodeToQrString(dataToExport);
    expect(qrString.startsWith('FC1:')).toBe(true);

    // Decode on simulated receiving device
    const decodedPayload = await codec.decodeFromQrString(qrString);

    // 3. Assert
    expect(decodedPayload.puzzles.ratingProfile.rating).toBe(1280);
    expect(decodedPayload.puzzles.ratingProfile.peakRating).toBe(1320);
    expect(decodedPayload.puzzles.arcadeStats.puzzleRushHighScore).toBe(21);
    expect(decodedPayload.scenarios['lesson_intro_1']?.starsEarned).toBe(3);
  });
});
