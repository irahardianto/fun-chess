import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import QrExportView from '@/features/portability/components/QrExportView.vue';

vi.mock('qrcode', () => ({
  default: {
    toCanvas: vi.fn().mockResolvedValue(undefined),
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQr'),
  },
}));

describe('QrExportView.vue', () => {
  let wrapper: VueWrapper;

  const mockPayload = {
    version: 1,
    exportedAt: 1700000000000,
    scenarios: {
      'lesson_1': { scenarioId: 'lesson_1', starsEarned: 3 as const, attemptsCount: 1, hintsUsedTotal: 0, firstCompletedAt: 1700000000000, lastCompletedAt: 1700000000000 },
    },
    puzzles: {
      ratingProfile: { rating: 1250, ratingDeviation: 100, peakRating: 1300, totalAttempted: 20, totalSolved: 16, bestStreak: 7, ratingHistory: [] },
      themeMastery: {},
      arcadeStats: { puzzleRushHighScore: 15, puzzleRushBestStreak: 8, streakSurvivorHighScore: 10, totalRushRuns: 4 },
      solvedPuzzles: {},
      createdAt: 1699000000000,
      lastActiveAt: 1700000000000,
    },
  };

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders QR code canvas frame with high-contrast background for optical scan reliability', async () => {
    // Arrange & Act
    wrapper = mount(QrExportView, {
      props: {
        payload: mockPayload,
        qrString: 'FC1:eJy1VMockData',
      },
    });
    await wrapper.vm.$nextTick();

    // Assert
    const qrFrame = wrapper.find('.qr-canvas-frame');
    expect(qrFrame.exists()).toBe(true);
    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('displays aggregate player stats summary in stats pill', () => {
    // Arrange & Act
    wrapper = mount(QrExportView, {
      props: {
        payload: mockPayload,
        qrString: 'FC1:eJy1VMockData',
      },
    });

    // Assert
    const statsPill = wrapper.find('.stats-preview-pill');
    expect(statsPill.exists()).toBe(true);
    expect(statsPill.text()).toContain('3'); // 3 stars
    expect(statsPill.text()).toContain('1250'); // rating
  });

  it('emits downloadJson when 1-click JSON backup button is clicked', async () => {
    // Arrange
    wrapper = mount(QrExportView, {
      props: {
        payload: mockPayload,
        qrString: 'FC1:eJy1VMockData',
      },
    });

    // Act
    const downloadBtn = wrapper.find('button.btn-tactile--primary');
    expect(downloadBtn.exists()).toBe(true);
    await downloadBtn.trigger('click');

    // Assert
    expect(wrapper.emitted('downloadJson')).toHaveLength(1);
  });

  it('copies QR string to clipboard and shows feedback', async () => {
    // Arrange
    wrapper = mount(QrExportView, {
      props: {
        payload: mockPayload,
        qrString: 'FC1:eJy1VMockData',
      },
    });

    // Act
    const copyBtn = wrapper.find('button.btn-tactile--ghost');
    expect(copyBtn.exists()).toBe(true);
    await copyBtn.trigger('click');

    // Assert
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('FC1:eJy1VMockData');
  });
});
