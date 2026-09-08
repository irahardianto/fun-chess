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

  it('binds stats directly to props.diffPreview values rather than recalculating', () => {
    const customDiffPreview: ProgressDiffPreview = {
      academy: {
        localCompletedCount: 5,
        incomingCompletedCount: 10,
        mergedCompletedCount: 12,
        localTotalStars: 15,
        incomingTotalStars: 28,
        mergedTotalStars: 30,
        newCompletedScenarios: ['lesson-3', 'lesson-4'],
        starUpgrades: [{ scenarioId: 'lesson-1', fromStars: 1, toStars: 3 }],
      },
      puzzles: {
        localSolvedCount: 42,
        incomingSolvedCount: 88,
        mergedSolvedCount: 95,
        localRating: 1200,
        incomingRating: 1650,
        mergedRating: 1650,
        localPeakRating: 1250,
        incomingPeakRating: 1700,
        mergedPeakRating: 1700,
        newPuzzlesSolvedCount: 53,
      },
      arcade: {
        localRushHighScore: 12,
        incomingRushHighScore: 25,
        mergedRushHighScore: 25,
        localSurvivorHighScore: 8,
        incomingSurvivorHighScore: 19,
        mergedSurvivorHighScore: 19,
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

    // Mount with null payloads to verify strict reliance on diffPreview values
    const wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress: null,
        incomingProgress: null,
        diffPreview: customDiffPreview,
      },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain('⭐ 15 Stars');
    expect(text).toContain('⭐ 28 Stars');
    expect(text).toContain('🎯 1200 Elo');
    expect(text).toContain('🎯 1650 Elo');
    expect(text).toContain('🧩 42 Solved');
    expect(text).toContain('🧩 88 Solved');
  });

  it('renders projected smart merge outcome card (.merge-outcome-callout) with summary pills', () => {
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

    const outcomeCard = wrapper.find('.merge-outcome-callout');
    expect(outcomeCard.exists()).toBe(true);
    expect(outcomeCard.find('.merge-outcome-title').text()).toContain('Projected Smart Merge Outcome');
    expect(outcomeCard.find('.merge-outcome-badge').text()).toBe('Safe Union');

    const cardText = outcomeCard.text();
    expect(cardText).toContain('⭐ 6');
    expect(cardText).toContain('+1 upgraded');
    expect(cardText).toContain('🎯 1350');
    expect(cardText).toContain('🧩 2');
    expect(cardText).toContain('+1 new');
  });

  it('emits canonical resolve-conflict with smart_merge on clicking Smart Merge button', async () => {
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
    expect(wrapper.emitted('resolve-conflict')?.[0]).toEqual(['smart_merge']);
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['smart_merge']);
    expect(wrapper.emitted('merge')?.[0]).toEqual(['smart_merge']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('emits canonical resolve-conflict with replace_local on Replace button click and displays clear overwrite warning subtext', async () => {
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

    expect(wrapper.text()).toContain('Scanned progress has different stats than this device. Choose how to merge:');
    expect(wrapper.text()).toContain('Replace Device Progress');
    expect(wrapper.text()).toContain('Replaces all stars and puzzle ratings on this device with incoming save');

    const replaceBtn = wrapper.findAll('button').find((b) => b.text().includes('Replace Device Progress'));
    expect(replaceBtn).toBeDefined();

    await replaceBtn?.trigger('click');
    expect(wrapper.emitted('resolve-conflict')?.[0]).toEqual(['replace_local']);
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['replace_local']);
    expect(wrapper.emitted('replace')?.[0]).toEqual(['replace_local']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('emits canonical resolve-conflict with keep_local and cancel-conflict on Keep current progress button click', async () => {
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

    const keepBtn = wrapper.findAll('button').find((b) => b.text().includes('Keep current progress'));
    expect(keepBtn).toBeDefined();

    await keepBtn?.trigger('click');
    expect(wrapper.emitted('resolve-conflict')?.[0]).toEqual(['keep_local']);
    expect(wrapper.emitted('cancel-conflict')).toBeTruthy();
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['keep_local']);
    expect(wrapper.emitted('cancel')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('emits cancel-conflict, close, and closed when closed from BaseModal close event', async () => {
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

    const baseModal = wrapper.findComponent({ name: 'BaseModal' });
    expect(baseModal.exists()).toBe(true);

    await baseModal.vm.$emit('close');
    expect(wrapper.emitted('cancel-conflict')).toBeTruthy();
    expect(wrapper.emitted('close')).toBeTruthy();
    expect(wrapper.emitted('closed')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });
});
