import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChessPieceSvg from '../ChessPieceSvg.vue';

describe('ChessPieceSvg.vue', () => {
  it('renders SVG for piece prop', () => {
    const wrapper = mount(ChessPieceSvg, {
      props: {
        piece: 'wK',
        size: 45,
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('data-piece')).toBe('wK');
    expect(svg.attributes('width')).toBe('45px');
    expect(svg.attributes('height')).toBe('45px');
  });

  it('renders SVG for separate color and type props', () => {
    const wrapper = mount(ChessPieceSvg, {
      props: {
        color: 'b',
        type: 'q',
        size: '32px',
      },
    });

    const svg = wrapper.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('data-piece')).toBe('bQ');
    expect(svg.attributes('width')).toBe('32px');
  });

  it('renders all 12 pieces without error', () => {
    const pieces = [
      'wP', 'wN', 'wB', 'wR', 'wQ', 'wK',
      'bP', 'bN', 'bB', 'bR', 'bQ', 'bK',
    ] as const;

    for (const piece of pieces) {
      const wrapper = mount(ChessPieceSvg, {
        props: { piece },
      });
      expect(wrapper.find('svg').exists()).toBe(true);
    }
  });
});
