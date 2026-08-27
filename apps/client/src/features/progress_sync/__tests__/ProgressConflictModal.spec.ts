import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import ProgressConflictModal from '@/features/portability/components/ProgressConflictModal.vue';
import type { ProgressDiffPreview, UnifiedProgressPayload } from '@fun-chess/shared';

describe('ProgressConflictModal.vue', () => {
  let wrapper: VueWrapper;

  const mockCurrent: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 1700000000000,
    scenarios: {
      'lesson_pawn_1': { scenarioId: 'lesson_pawn_1', starsEarned: 2, attemptsCount: 2, hintsUsedTotal: 1, firstCompletedAt: 1700000000000, lastCompletedAt: 1700000000000 },
    },
    puzzles: {
      ratingProfile: { rating: 1100, ratingDeviation: 120, peakRating: 1150, totalAttempted: 10, totalSolved: 8, bestStreak: 5, ratingHistory: [] },
      themeMastery: {},
      arcadeStats: { puzzleRushHighScore: 10, puzzleRushBestStreak: 4, streakSurvivorHighScore: 7, totalRushRuns: 2 },
      solvedPuzzles: { 'puz_001': { stars: 2, solvedAt: 1700000000000 } },
      createdAt: 1699000000000,
      lastActiveAt: 1700000000000,
    },
  };

  const mockIncoming: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 1700050000000,
    scenarios: {
      'lesson_pawn_1': { scenarioId: 'lesson_pawn_1', starsEarned: 3, attemptsCount: 1, hintsUsedTotal: 0, firstCompletedAt: 1700050000000, lastCompletedAt: 1700050000000 },
    },
    puzzles: {
      ratingProfile: { rating: 1350, ratingDeviation: 80, peakRating: 1380, totalAttempted: 25, totalSolved: 22, bestStreak: 9, ratingHistory: [] },
      themeMastery: {},
      arcadeStats: { puzzleRushHighScore: 18, puzzleRushBestStreak: 8, streakSurvivorHighScore: 12, totalRushRuns: 4 },
      solvedPuzzles: { 'puz_001': { stars: 3, solvedAt: 1700050000000 }, 'puz_002': { stars: 3, solvedAt: 1700050000000 } },
      createdAt: 1699000000000,
      lastActiveAt: 1700050000000,
    },
  };

  const mockDiff: ProgressDiffPreview = {
    academy: {
      localCompletedCount: 10,
      incomingCompletedCount: 15,
      mergedCompletedCount: 18,
      localTotalStars: 24,
      incomingTotalStars: 36,
      mergedTotalStars: 42,
      newCompletedScenarios: ['lesson_fork_1', 'lesson_pin_2'],
      starUpgrades: [
        { scenarioId: 'lesson_pawn_1', fromStars: 2, toStars: 3 },
      ],
    },
    puzzles: {
      localSolvedCount: 45,
      incomingSolvedCount: 70,
      mergedSolvedCount: 82,
      localRating: 1100,
      incomingRating: 1350,
      mergedRating: 1350,
      localPeakRating: 1150,
      incomingPeakRating: 1380,
      mergedPeakRating: 1380,
      newPuzzlesSolvedCount: 37,
    },
    arcade: {
      localRushHighScore: 10,
      incomingRushHighScore: 18,
      mergedRushHighScore: 18,
      localSurvivorHighScore: 7,
      incomingSurvivorHighScore: 12,
      mergedSurvivorHighScore: 12,
    },
    metadata: {
      localLastActiveAt: 1700000000000,
      incomingLastActiveAt: 1700050000000,
      incomingExportedAt: 1700050000000,
      isIncomingNewer: true,
    },
    hasDifferences: true,
    hasUpgrades: true,
  };

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders side-by-side stats comparison cards for current and imported saves', () => {
    // Arrange & Act
    wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress: mockCurrent,
        incomingProgress: mockIncoming,
        diffPreview: mockDiff,
      },
    });

    // Assert
    const currentCard = document.body.querySelector('.conflict-card:not(.is-imported)');
    const importedCard = document.body.querySelector('.conflict-card.is-imported');

    expect(currentCard).not.toBeNull();
    expect(importedCard).not.toBeNull();

    expect(currentCard?.textContent).toContain('1100'); // Local rating
    expect(importedCard?.textContent).toContain('1350'); // Imported rating
  });

  it('highlights superior stats with winner badges ([BEST] / is-winner)', () => {
    // Arrange & Act
    wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress: mockCurrent,
        incomingProgress: mockIncoming,
        diffPreview: mockDiff,
      },
    });

    // Assert
    const winnerBadges = document.body.querySelectorAll('.stat-winner-badge');
    expect(winnerBadges.length).toBeGreaterThan(0);

    const winnerRows = document.body.querySelectorAll('.stat-diff-row.is-winner');
    expect(winnerRows.length).toBeGreaterThan(0);
  });

  it('displays educational explanation of smart merge benefit', () => {
    // Arrange & Act
    wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress: mockCurrent,
        incomingProgress: mockIncoming,
        diffPreview: mockDiff,
      },
    });

    // Assert
    const explanation = document.body.querySelector('.merge-info-callout');
    expect(explanation).not.toBeNull();
    expect(explanation?.textContent).toContain('Smart Merge');
    expect(explanation?.textContent).toContain('No data is lost');
  });

  it('emits resolve event with "smart_merge" when Smart Merge button is clicked', async () => {
    // Arrange
    wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress: mockCurrent,
        incomingProgress: mockIncoming,
        diffPreview: mockDiff,
      },
    });

    // Act
    const smartMergeBtn = document.body.querySelector('.btn-tactile--success') as HTMLButtonElement;
    expect(smartMergeBtn).not.toBeNull();
    smartMergeBtn.click();
    await wrapper.vm.$nextTick();

    // Assert
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['smart_merge']);
  });

  it('emits resolve event with "replace_local" when Overwrite button is clicked', async () => {
    // Arrange
    wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress: mockCurrent,
        incomingProgress: mockIncoming,
        diffPreview: mockDiff,
      },
    });

    // Act
    const overwriteBtn = document.body.querySelector('.btn-tactile--danger') as HTMLButtonElement;
    expect(overwriteBtn).not.toBeNull();
    overwriteBtn.click();
    await wrapper.vm.$nextTick();

    // Assert
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['replace_local']);
  });

  it('emits resolve event with "keep_local" when Cancel button is clicked', async () => {
    // Arrange
    wrapper = mount(ProgressConflictModal, {
      props: {
        modelValue: true,
        currentProgress: mockCurrent,
        incomingProgress: mockIncoming,
        diffPreview: mockDiff,
      },
    });

    // Act
    const cancelBtn = document.body.querySelector('.btn-tactile--ghost') as HTMLButtonElement;
    expect(cancelBtn).not.toBeNull();
    cancelBtn.click();
    await wrapper.vm.$nextTick();

    // Assert
    expect(wrapper.emitted('resolve')?.[0]).toEqual(['keep_local']);
  });
});
