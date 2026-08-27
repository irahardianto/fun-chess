import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProgressConflictModal from '../ProgressConflictModal.vue';
import type { UnifiedProgressPayload, ProgressDiffPreview } from '@fun-chess/shared';

describe('ProgressConflictModal.vue', () => {
  const currentProgress: UnifiedProgressPayload = {
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
        rating: 1100,
        ratingDeviation: 150,
        peakRating: 1100,
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
        'puz-1': { stars: 2, solvedAt: 1000 },
      },
      createdAt: 1000,
      lastActiveAt: 1000,
    },
  };

  const incomingProgress: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 2000,
    scenarios: {
      'lesson-1': {
        scenarioId: 'lesson-1',
        starsEarned: 3,
        attemptsCount: 2,
        hintsUsedTotal: 0,
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
      ratingProfile: {
        rating: 1350,
        ratingDeviation: 100,
        peakRating: 1350,
        totalAttempted: 25,
        totalSolved: 20,
        bestStreak: 9,
        ratingHistory: [],
      },
      themeMastery: {},
      arcadeStats: {
        puzzleRushHighScore: 18,
        puzzleRushBestStreak: 7,
        streakSurvivorHighScore: 12,
        totalRushRuns: 6,
      },
      solvedPuzzles: {
        'puz-1': { stars: 3, solvedAt: 1000 },
        'puz-2': { stars: 3, solvedAt: 2000 },
      },
      createdAt: 1000,
      lastActiveAt: 2000,
    },
  };

  const diffPreview: ProgressDiffPreview = {
    academy: {
      localCompletedCount: 1,
      incomingCompletedCount: 2,
      mergedCompletedCount: 2,
      localTotalStars: 2,
      incomingTotalStars: 6,
      mergedTotalStars: 6,
      newCompletedScenarios: ['lesson-2'],
      starUpgrades: [{ scenarioId: 'lesson-1', fromStars: 2, toStars: 3 }],
    },
    puzzles: {
      localSolvedCount: 1,
      incomingSolvedCount: 2,
      mergedSolvedCount: 2,
      localRating: 1100,
      incomingRating: 1350,
      mergedRating: 1350,
      localPeakRating: 1100,
      incomingPeakRating: 1350,
      mergedPeakRating: 1350,
      newPuzzlesSolvedCount: 1,
    },
    arcade: {
      localRushHighScore: 10,
      incomingRushHighScore: 18,
      mergedRushHighScore: 18,
      localSurvivorHighScore: 5,
      incomingSurvivorHighScore: 12,
      mergedSurvivorHighScore: 12,
    },
    metadata: {
      localLastActiveAt: 1000,
      incomingLastActiveAt: 2000,
      incomingExportedAt: 2000,
      isIncomingNewer: true,
    },
    hasDifferences: true,
    hasUpgrades: true,
  };

  it('renders side-by-side comparison with [BEST] badges on winner stats', () => {
    const wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress,
        incomingProgress,
        diffPreview,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const badges = wrapper.findAll('.stat-winner-badge');
    expect(badges.length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain('Current Device');
    expect(wrapper.text()).toContain('Imported Save');
    expect(wrapper.text()).toContain('1350 Elo');
  });

  it('emits resolve with smart_merge on clicking Smart Merge button', async () => {
    const wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress,
        incomingProgress,
        diffPreview,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const smartMergeBtn = wrapper.findAll('button').find((b) => b.text().includes('Smart Merge'));
    expect(smartMergeBtn).toBeDefined();

    await smartMergeBtn?.trigger('click');
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['smart_merge']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('emits resolve with replace_local on Overwrite button click', async () => {
    const wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress,
        incomingProgress,
        diffPreview,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const overwriteBtn = wrapper.findAll('button').find((b) => b.text().includes('Overwrite'));
    expect(overwriteBtn).toBeDefined();

    await overwriteBtn?.trigger('click');
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['replace_local']);
  });

  it('emits resolve with keep_local on Cancel button click', async () => {
    const wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress,
        incomingProgress,
        diffPreview,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('Cancel'));
    expect(cancelBtn).toBeDefined();

    await cancelBtn?.trigger('click');
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['keep_local']);
  });
});
