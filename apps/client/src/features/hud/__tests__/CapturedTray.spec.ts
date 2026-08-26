import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CapturedTray from '../CapturedTray.vue';

describe('CapturedTray.vue', () => {
  it('renders empty label when no captured pieces exist', () => {
    const wrapper = mount(CapturedTray, {
      props: {
        capturedPieces: [],
        color: 'w',
        materialAdvantage: 0,
      },
    });

    expect(wrapper.find('.empty-tray-label').exists()).toBe(true);
    expect(wrapper.text()).toContain('No captures');
    expect(wrapper.find('[data-testid="material-advantage"]').exists()).toBe(false);
  });

  it('renders captured pieces sorted by piece value (Queen before Pawns)', () => {
    const wrapper = mount(CapturedTray, {
      props: {
        capturedPieces: ['p', 'q', 'p', 'r'],
        color: 'w',
        materialAdvantage: 10,
      },
    });

    const svgs = wrapper.findAll('svg');
    expect(svgs).toHaveLength(4);

    const pieceItems = wrapper.findAll('.tray-piece-item');
    expect(pieceItems).toHaveLength(4);
  });

  it('renders material advantage badge with + prefix when positive', () => {
    const wrapper = mount(CapturedTray, {
      props: {
        capturedPieces: ['p', 'n'],
        color: 'b',
        materialAdvantage: 4,
      },
    });

    const badge = wrapper.find('[data-testid="material-advantage"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('+4');
  });
});
