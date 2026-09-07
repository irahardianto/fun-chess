import { bench, describe } from 'vitest';
import { DefaultProgressCodec } from '../progress_codec.js';
import { canonicalJsonStringify } from '../canonical_json.js';
import type { UnifiedProgressPayload } from '../../types/progress_sync.js';

describe('Shared Progress Codec Benchmark', () => {
  const codec = new DefaultProgressCodec();

  const scenarios: UnifiedProgressPayload['scenarios'] = {};
  for (let i = 1; i <= 20; i++) {
    const id = `lesson-${i}`;
    scenarios[id] = {
      scenarioId: id,
      starsEarned: ((i % 3) + 1) as 1 | 2 | 3,
      attemptsCount: (i % 4) + 1,
      hintsUsedTotal: i % 2,
      firstCompletedAt: 1700000000000 + i * 1000,
      lastCompletedAt: 1700000000000 + i * 2000,
    };
  }

  const solvedPuzzles: UnifiedProgressPayload['puzzles']['solvedPuzzles'] = {};
  for (let i = 1; i <= 20; i++) {
    const id = `puz_${i}`;
    solvedPuzzles[id] = {
      stars: ((i % 3) + 1) as 1 | 2 | 3,
      solvedAt: 1700000000000 + i * 1000,
    };
  }

  const payload: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 1700000000000,
    clientVersion: '1.0.0',
    scenarios,
    puzzles: {
      ratingProfile: {
        rating: 1350,
        ratingDeviation: 85,
        peakRating: 1420,
        totalAttempted: 50,
        totalSolved: 42,
        bestStreak: 11,
        ratingHistory: [],
      },
      themeMastery: {
        fork: {
          theme: 'fork',
          attempted: 25,
          solved: 22,
          starsEarned: 35,
          masteryLevel: 'master',
          lastPracticedAt: 1700000000000,
        },
      },
      arcadeStats: {
        puzzleRushHighScore: 25,
        puzzleRushBestStreak: 9,
        streakSurvivorHighScore: 18,
        totalRushRuns: 12,
      },
      solvedPuzzles,
      createdAt: 1690000000000,
      lastActiveAt: 1700000000000,
    },
  };

  let qrString = '';
  // Warm up and obtain qrString
  codec.encodeToQrString(payload).then((res) => {
    qrString = res;
  });

  bench('canonicalJsonStringify', () => {
    canonicalJsonStringify(payload);
  });

  bench('encodeToQrString', async () => {
    await codec.encodeToQrString(payload);
  });

  bench('decodeFromQrString', async () => {
    await codec.decodeFromQrString(qrString);
  });
});
