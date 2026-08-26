import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProgressiveHintLayer from '../ProgressiveHintLayer.vue';

describe('ProgressiveHintLayer.vue', () => {
  it('renders nothing when hint level is 0', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 0,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
  });

  it('renders Tier 1 nudge square overlay when level is 1', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 1,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
  });

  it('renders Tier 2 beacon overlay when level is 2', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 2,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
  });

  it('renders Tier 3 vector arrow and ghost piece when level is 3', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 3,
        sourceSquare: 'e2',
        targetSquare: 'e4',
        movingPiece: { type: 'p', color: 'w' },
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-ghost-piece"]').exists()).toBe(true);
  });
});
