import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChessPiece from '../ChessPiece.vue';

describe('ChessPiece.vue', () => {
  it('renders chess piece SVG and container attributes', () => {
    const wrapper = mount(ChessPiece, {
      props: {
        piece: 'wK',
      },
    });

    expect(wrapper.find('[data-testid="chess-piece"]').exists()).toBe(true);
    expect(wrapper.attributes('data-piece')).toBe('wK');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('applies selected and dragging classes when props are true', () => {
    const wrapper = mount(ChessPiece, {
      props: {
        piece: 'bQ',
        isSelected: true,
        isDragging: true,
      },
    });

    expect(wrapper.classes()).toContain('is-selected');
    expect(wrapper.classes()).toContain('is-dragging');
  });

  it('emits click event on user interaction', async () => {
    const wrapper = mount(ChessPiece, {
      props: {
        piece: 'wN',
      },
    });

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('emits dragstart when draggable', async () => {
    const wrapper = mount(ChessPiece, {
      props: {
        piece: 'wP',
        draggable: true,
      },
    });

    await wrapper.trigger('dragstart');

    expect(wrapper.emitted('dragstart')).toHaveLength(1);
  });
});
