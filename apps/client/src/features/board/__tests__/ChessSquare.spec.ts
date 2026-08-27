import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChessSquare from '../ChessSquare.vue';

describe('ChessSquare.vue', () => {
  it('renders square with correct light or dark class and data attribute', () => {
    const wrapperLight = mount(ChessSquare, {
      props: {
        square: 'e4',
        isLight: true,
      },
    });
    expect(wrapperLight.classes()).toContain('is-light');
    expect(wrapperLight.attributes('data-square')).toBe('e4');

    const wrapperDark = mount(ChessSquare, {
      props: {
        square: 'e5',
        isLight: false,
      },
    });
    expect(wrapperDark.classes()).toContain('is-dark');
  });

  it('renders rank and file labels when enabled', () => {
    const wrapper = mount(ChessSquare, {
      props: {
        square: 'a1',
        isLight: false,
        showRankLabel: true,
        rankLabel: '1',
        showFileLabel: true,
        fileLabel: 'a',
      },
    });

    expect(wrapper.find('.rank-label').text()).toBe('1');
    expect(wrapper.find('.file-label').text()).toBe('a');
  });

  it('applies state classes for selection, last move, and check halo', () => {
    const wrapper = mount(ChessSquare, {
      props: {
        square: 'e1',
        isLight: false,
        isSelected: true,
        isLastMove: true,
        isInCheck: true,
      },
    });

    expect(wrapper.classes()).toContain('is-selected');
    expect(wrapper.classes()).toContain('is-last-move');
    expect(wrapper.classes()).toContain('square-in-check');
  });

  it('renders move indicator when isValidMove or isCaptureTarget is true', () => {
    const wrapperValid = mount(ChessSquare, {
      props: {
        square: 'e4',
        isLight: true,
        isValidMove: true,
      },
    });
    expect(wrapperValid.find('[data-testid="move-indicator"]').exists()).toBe(true);
    expect(wrapperValid.find('.move-indicator-ring').exists()).toBe(true);
    expect(wrapperValid.find('.valid-move-ring').exists()).toBe(true);

    const wrapperCapture = mount(ChessSquare, {
      props: {
        square: 'd5',
        isLight: false,
        isCaptureTarget: true,
      },
    });
    expect(wrapperCapture.find('.move-indicator-ring').exists()).toBe(true);
    expect(wrapperCapture.find('.capture-target-ring').exists()).toBe(true);
  });

  it('emits select event on click', async () => {
    const wrapper = mount(ChessSquare, {
      props: {
        square: 'd4',
        isLight: true,
      },
    });

    await wrapper.trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')?.[0]).toEqual(['d4']);
  });

  it('emits drop event when drag and dropped with fromSquare', async () => {
    const wrapper = mount(ChessSquare, {
      props: {
        square: 'e4',
        isLight: true,
      },
    });

    const dropEvent = {
      preventDefault: () => {},
      dataTransfer: {
        getData: (format: string) => (format === 'text/plain' ? 'e2' : ''),
      },
    };

    await wrapper.trigger('drop', dropEvent);
    expect(wrapper.emitted('drop')).toHaveLength(1);
    expect(wrapper.emitted('drop')?.[0]).toEqual(['e2', 'e4']);
  });

  it('manages roving tabindex (0 for active square, -1 for inactive)', () => {
    const wrapperInactive = mount(ChessSquare, {
      props: {
        square: 'e4',
        isLight: true,
        isSquareActive: false,
      },
    });
    expect(wrapperInactive.attributes('tabindex')).toBe('-1');

    const wrapperActive = mount(ChessSquare, {
      props: {
        square: 'e4',
        isLight: true,
        isSquareActive: true,
      },
    });
    expect(wrapperActive.attributes('tabindex')).toBe('0');
  });

  it('handles Enter and Space keydown to trigger selection', async () => {
    const wrapper = mount(ChessSquare, {
      props: {
        square: 'c5',
        isLight: true,
        isSquareActive: true,
      },
    });

    await wrapper.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')?.[0]).toEqual(['c5']);

    await wrapper.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('select')?.[1]).toEqual(['c5']);
  });

  it('emits keydown with event and square when arrow key is pressed', async () => {
    const wrapper = mount(ChessSquare, {
      props: {
        square: 'e4',
        isLight: true,
        isSquareActive: true,
      },
    });

    await wrapper.trigger('keydown', { key: 'ArrowUp' });
    expect(wrapper.emitted('keydown')).toBeDefined();
    expect(wrapper.emitted('keydown')?.[0][1]).toBe('e4');
  });
});
