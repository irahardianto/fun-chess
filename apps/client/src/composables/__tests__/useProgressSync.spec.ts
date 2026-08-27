import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import { useProgressSync } from '../useProgressSync';
import {
  DefaultProgressCodec,
  DefaultProgressMergeEngine,
  type UnifiedProgressPayload,
  type ProgressStorage,
  FUN_CHESS_PAYLOAD_MAGIC_PREFIX,
} from '@fun-chess/shared';

describe('useProgressSync composable', () => {
  const codec = new DefaultProgressCodec();
  const mergeEngine = new DefaultProgressMergeEngine();

  const createMockPayload = (elo: number = 1000, stars: 1 | 2 | 3 = 2): UnifiedProgressPayload => ({
    version: 1,
    exportedAt: 1700000000000,
    clientVersion: '1.0.0',
    scenarios: {
      'lesson_pawn_1': {
        scenarioId: 'lesson_pawn_1',
        starsEarned: stars,
        attemptsCount: 2,
        hintsUsedTotal: 1,
        firstCompletedAt: 1700000000000,
        lastCompletedAt: 1700000000000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: elo,
        ratingDeviation: 120,
        peakRating: elo,
        totalAttempted: 10,
        totalSolved: 8,
        bestStreak: 4,
        ratingHistory: [],
      },
      themeMastery: {
        fork: {
          theme: 'fork',
          attempted: 5,
          solved: 4,
          starsEarned: 8,
          masteryLevel: 'novice',
          lastPracticedAt: 1700000000000,
        },
      },
      arcadeStats: {
        puzzleRushHighScore: 12,
        puzzleRushBestStreak: 6,
        streakSurvivorHighScore: 8,
        totalRushRuns: 3,
      },
      solvedPuzzles: {
        'puz_fork_001': {
          stars: 3,
          solvedAt: 1700000000000,
        },
      },
      createdAt: 1699000000000,
      lastActiveAt: 1700000000000,
    },
  });

  let mockStorageData: UnifiedProgressPayload;
  let mockStorage: ProgressStorage;
  let mockFileService: any;

  beforeEach(() => {
    mockStorageData = createMockPayload(1000, 2);
    mockStorage = {
      getUnifiedProgress: vi.fn(async () => JSON.parse(JSON.stringify(mockStorageData))),
      saveUnifiedProgress: vi.fn(async (payload) => {
        mockStorageData = JSON.parse(JSON.stringify(payload));
      }),
    };
    mockFileService = {
      downloadProgressFile: vi.fn(),
      readProgressFile: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports progress to compact QR string format with FC1: prefix', async () => {
    // Arrange
    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    // Act
    const qrString = await sync?.exportQrString();

    // Assert
    expect(qrString).toBeDefined();
    expect(qrString?.startsWith(FUN_CHESS_PAYLOAD_MAGIC_PREFIX)).toBe(true);
    expect(mockStorage.getUnifiedProgress).toHaveBeenCalled();
    scope.stop();
  });

  it('exports progress to valid JSON envelope format with checksum and metadata', async () => {
    // Arrange
    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    // Act
    const envelopeJson = await sync?.exportJson('test-save.json');

    // Assert
    expect(envelopeJson).toBeDefined();
    expect(mockFileService.downloadProgressFile).toHaveBeenCalledWith(envelopeJson, 'test-save.json');
    const parsed = JSON.parse(envelopeJson!);
    expect(parsed.magic).toBe('FC_PROGRESS_V1');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.checksum).toMatch(/^[0-9A-F]{8}$/);
    expect(parsed.payload.puzzles.ratingProfile.rating).toBe(1000);
    scope.stop();
  });

  it('imports valid QR string, detects differences, and triggers conflict modal preview', async () => {
    // Arrange
    const incomingPayload = createMockPayload(1450, 3);
    const validQrString = await codec.encodeToQrString(incomingPayload);

    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    // Act
    const autoMerged = await sync?.importPayload(validQrString);

    // Assert
    expect(autoMerged).toBe(false); // differences found -> opens conflict modal
    expect(sync?.isConflictModalOpen.value).toBe(true);
    expect(sync?.diffPreview.value?.hasDifferences).toBe(true);
    expect(sync?.diffPreview.value?.puzzles.incomingRating).toBe(1450);
    expect(sync?.incomingPayload.value?.puzzles.ratingProfile.rating).toBe(1450);
    expect(sync?.syncError.value).toBeNull();
    scope.stop();
  });

  it('imports valid JSON envelope string and triggers conflict preview correctly', async () => {
    // Arrange
    const incomingPayload = createMockPayload(1300, 3);
    const envelopeJson = codec.encodeToEnvelopeJson(incomingPayload);

    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    // Act
    const autoMerged = await sync?.importPayload(envelopeJson);

    // Assert
    expect(autoMerged).toBe(false);
    expect(sync?.isConflictModalOpen.value).toBe(true);
    expect(sync?.diffPreview.value?.hasDifferences).toBe(true);
    expect(sync?.diffPreview.value?.puzzles.incomingRating).toBe(1300);
    expect(sync?.incomingPayload.value).not.toBeNull();
    expect(sync?.syncError.value).toBeNull();
    scope.stop();
  });

  it('executes smart_merge strategy non-destructively combining highest ratings and stars', async () => {
    // Arrange: Local Elo 1000 / Incoming Elo 1450
    const incomingPayload = createMockPayload(1450, 3);
    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    await sync?.importPayload(await codec.encodeToQrString(incomingPayload));
    expect(sync?.isConflictModalOpen.value).toBe(true);

    // Act
    const merged = await sync?.executeMerge('smart_merge');

    // Assert
    expect(mockStorage.saveUnifiedProgress).toHaveBeenCalled();
    expect(merged?.puzzles.ratingProfile.rating).toBe(1450);
    expect(merged?.scenarios['lesson_pawn_1']?.starsEarned).toBe(3);
    expect(mockStorageData.puzzles.ratingProfile.rating).toBe(1450);
    expect(sync?.incomingPayload.value).toBeNull();
    expect(sync?.isConflictModalOpen.value).toBe(false);
    scope.stop();
  });

  it('executes replace_local strategy replacing local progress with incoming payload', async () => {
    // Arrange
    const incomingPayload = createMockPayload(1600, 3);
    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    await sync?.importPayload(await codec.encodeToQrString(incomingPayload));

    // Act
    const replaced = await sync?.executeMerge('replace_local');

    // Assert
    expect(mockStorage.saveUnifiedProgress).toHaveBeenCalled();
    expect(replaced?.puzzles.ratingProfile.rating).toBe(1600);
    expect(mockStorageData.puzzles.ratingProfile.rating).toBe(1600);
    expect(sync?.incomingPayload.value).toBeNull();
    scope.stop();
  });

  it('executes keep_local strategy maintaining current local progress', async () => {
    // Arrange
    const incomingPayload = createMockPayload(1600, 3);
    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    await sync?.importPayload(await codec.encodeToQrString(incomingPayload));

    // Act
    const kept = await sync?.executeMerge('keep_local');

    // Assert
    expect(kept?.puzzles.ratingProfile.rating).toBe(1000);
    expect(mockStorageData.puzzles.ratingProfile.rating).toBe(1000);
    expect(sync?.incomingPayload.value).toBeNull();
    scope.stop();
  });

  it('handles corrupted QR string defensively with kid-friendly error message without uncaught exception', async () => {
    // Arrange: Tampered Base64 data with invalid CRC
    const corruptedQrString = 'FC1:eJy1V_TAMPERED_INVALID_DATA_XXX';
    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    // Act
    const result = await sync?.importPayload(corruptedQrString);

    // Assert
    expect(result).toBe(false);
    expect(sync?.incomingPayload.value).toBeNull();
    expect(sync?.syncError.value).not.toBeNull();
    scope.stop();
  });

  it('handles corrupted JSON envelope defensively with kid-friendly error message', async () => {
    // Arrange: Malformed JSON string
    const malformedJson = '{ "magic": "FC_PROGRESS_V1", "corrupted": true ';
    const scope = effectScope();
    let sync: ReturnType<typeof useProgressSync> | undefined;
    scope.run(() => {
      sync = useProgressSync({ storage: mockStorage, codec, mergeEngine, fileService: mockFileService });
    });

    // Act
    const result = await sync?.importPayload(malformedJson);

    // Assert
    expect(result).toBe(false);
    expect(sync?.incomingPayload.value).toBeNull();
    expect(sync?.syncError.value).not.toBeNull();
    scope.stop();
  });
});
