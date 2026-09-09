import { beforeEach, describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import QrExportView from '../QrExportView.vue';
import type { UnifiedProgressPayload } from '@fun-chess/shared';

describe('QrExportView.vue', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(1000) }),
    } as unknown as CanvasRenderingContext2D);
  });
  const payload: UnifiedProgressPayload = {
    version: 1,
    exportedAt: 1000,
    scenarios: {
      'lesson-1': {
        scenarioId: 'lesson-1',
        starsEarned: 3,
        attemptsCount: 1,
        hintsUsedTotal: 0,
        firstCompletedAt: 1000,
        lastCompletedAt: 1000,
      },
    },
    puzzles: {
      ratingProfile: {
        rating: 1200,
        ratingDeviation: 100,
        peakRating: 1200,
        totalAttempted: 10,
        totalSolved: 9,
        bestStreak: 5,
        ratingHistory: [],
      },
      themeMastery: {},
      arcadeStats: {
        puzzleRushHighScore: 15,
        puzzleRushBestStreak: 6,
        streakSurvivorHighScore: 10,
        totalRushRuns: 3,
      },
      solvedPuzzles: {
        'puz-1': { stars: 3, solvedAt: 1000 },
      },
      createdAt: 1000,
      lastActiveAt: 1000,
    },
  };

  it('renders stats preview and copy/download buttons', () => {
    const wrapper = mount(QrExportView, {
      props: {
        payload,
        qrString: 'FC1:test_qr_data',
      },
    });

    expect(wrapper.text()).toContain('3 Stars');
    expect(wrapper.text()).toContain('1200 Elo');
    expect(wrapper.text()).toContain('1 Puzzles Solved');
    expect(wrapper.text()).toContain('Download funchess-save.json');
    expect(wrapper.text()).toContain('Copy QR Code Text');
  });

  it('emits downloadJson event on 1-click backup button click', async () => {
    const wrapper = mount(QrExportView, {
      props: {
        payload,
        qrString: 'FC1:test_qr_data',
      },
    });

    const downloadBtn = wrapper.findAll('button').find((b) => b.text().includes('Download'));
    await downloadBtn?.trigger('click');

    expect(wrapper.emitted('downloadJson')).toBeDefined();
  });

  it('sets canvasError when 2D canvas context acquisition fails', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const wrapper = mount(QrExportView, {
      props: {
        payload,
        qrString: 'FC1:test_qr_data',
      },
    });

    await (wrapper.vm as any).renderQrCode();
    expect((wrapper.vm as any).canvasError).toBe('Failed to acquire 2D canvas context');
    expect(wrapper.find('.canvas-error-text').exists()).toBe(true);
  });
});
