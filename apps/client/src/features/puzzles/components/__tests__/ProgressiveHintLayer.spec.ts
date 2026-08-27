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

  it('renders slot content inside hint-board-anchor without breaking layout', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 1,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
      slots: {
        default: '<div class="test-board-content">Mock Board</div>',
      },
    });

    const anchor = wrapper.find('.hint-board-anchor');
    expect(anchor.exists()).toBe(true);
    expect(anchor.find('.test-board-content').exists()).toBe(true);
    expect(anchor.find('.test-board-content').text()).toBe('Mock Board');
    expect(anchor.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
  });

  it('hides controls when showControls is false', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 2,
        sourceSquare: 'e2',
        targetSquare: 'e4',
        showControls: false,
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
    expect(wrapper.find('.hint-controls-wrapper').exists()).toBe(false);
    expect(wrapper.find('[data-testid="request-hint-btn"]').exists()).toBe(false);
  });

  it('renders speech bubble and callouts when hintData is provided', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 3,
        showControls: true,
        hintData: {
          level: 3,
          tier: 'full_solution',
          sourceSquare: 'e2',
          targetSquare: 'e4',
          message: 'Advance the king pawn!',
          mascotDialogue: 'Good luck solving!',
          solutionSan: 'e4',
        },
      },
    });

    expect(wrapper.find('[data-testid="hint-speech-bubble"]').exists()).toBe(true);
    expect(wrapper.find('.hint-bubble-message').text()).toContain('Advance the king pawn!');
    expect(wrapper.find('.hint-mascot-dialogue').text()).toContain('Good luck solving!');
    expect(wrapper.find('.solution-san').text()).toBe('e4');
  });

  it('emits request-hint event on button click', async () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 0,
        showControls: true,
      },
    });

    const button = wrapper.find('[data-testid="request-hint-btn"]');
    await button.trigger('click');

    expect(wrapper.emitted('request-hint')).toHaveLength(1);
  });
});
