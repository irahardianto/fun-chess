import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiMascotBadge from '../AiMascotBadge.vue';
import { peanutPup, grandmasterOwl } from '../../data/index';

describe('AiMascotBadge.vue', () => {
  it('renders mascot name, avatar, ELO score, and AI tag', () => {
    const wrapper = mount(AiMascotBadge, {
      props: {
        mascot: peanutPup,
        color: 'b',
      },
    });

    expect(wrapper.text()).toContain('Peanut the Pup');
    expect(wrapper.text()).toContain('🐶');
    expect(wrapper.text()).toContain('~400');
    expect(wrapper.text()).toContain('AI');
    expect(wrapper.text()).toContain('Black');
  });

  it('renders speech bubble text when dialogue prop is provided', () => {
    const wrapper = mount(AiMascotBadge, {
      props: {
        mascot: peanutPup,
        dialogue: 'Woof! Let’s play some chess! 🎾',
      },
    });

    const speechBubble = wrapper.find('[data-testid="mascot-dialogue-bubble"]');
    expect(speechBubble.exists()).toBe(true);
    expect(speechBubble.text()).toContain('Woof! Let’s play some chess! 🎾');
  });

  it('does not render speech bubble when dialogue prop is null', () => {
    const wrapper = mount(AiMascotBadge, {
      props: {
        mascot: peanutPup,
        dialogue: null,
      },
    });

    const speechBubble = wrapper.find('[data-testid="mascot-dialogue-bubble"]');
    expect(speechBubble.exists()).toBe(false);
  });

  it('renders thinking state indicators (dots container and thinking badge) when isThinking is true', () => {
    const wrapper = mount(AiMascotBadge, {
      props: {
        mascot: grandmasterOwl,
        isCurrentTurn: true,
        isThinking: true,
      },
    });

    expect(wrapper.find('.badge-card').classes()).toContain('is-thinking');
    expect(wrapper.find('.badge-card').classes()).toContain('is-active-turn');

    const thinkingDots = wrapper.find('.thinking-dots-container');
    expect(thinkingDots.exists()).toBe(true);

    const thinkingDotIndicator = wrapper.find('.thinking-indicator-dot');
    expect(thinkingDotIndicator.exists()).toBe(true);

    const turnPill = wrapper.find('.turn-status-pill');
    expect(turnPill.exists()).toBe(true);
    expect(turnPill.text()).toBe('Calculating...');
  });

  it('renders active turn indicator without thinking dots when isCurrentTurn is true and isThinking is false', () => {
    const wrapper = mount(AiMascotBadge, {
      props: {
        mascot: peanutPup,
        isCurrentTurn: true,
        isThinking: false,
      },
    });

    expect(wrapper.find('.badge-card').classes()).toContain('is-active-turn');
    expect(wrapper.find('.badge-card').classes()).not.toContain('is-thinking');

    expect(wrapper.find('.thinking-dots-container').exists()).toBe(false);
    expect(wrapper.find('.thinking-indicator-dot').exists()).toBe(false);

    const turnPill = wrapper.find('.turn-status-pill');
    expect(turnPill.exists()).toBe(true);
    expect(turnPill.text()).toBe('Thinking... ⏳');
  });
});
