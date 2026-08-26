import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import SoloAiArena from '../SoloAiArena.vue';

// Mock confetti
vi.mock('@/composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrateVictory: vi.fn(),
    celebrateDraw: vi.fn(),
  }),
}));

describe('SoloAiArena.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders solo arena with header, mascot opponent name, and playfield', () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
        playerName: 'Kid Champion',
        playerAvatar: '🦁',
      },
    });

    expect(wrapper.find('[data-testid="solo-ai-arena"]').exists()).toBe(true);
    expect(wrapper.find('.opponent-name-tag').text()).toContain('Peanut');
    expect(wrapper.findComponent({ name: 'ChessBoard' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'AiMascotBadge' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'AiGameHud' }).exists()).toBe(true);
  });

  it('emits exit and lobby events when back button is clicked in header', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    const exitBtn = wrapper.find('[data-testid="exit-arena-btn"]');
    await exitBtn.trigger('click');

    expect(wrapper.emitted('exit')).toBeTruthy();
    expect(wrapper.emitted('lobby')).toBeTruthy();
  });

  it('emits changeOpponent when change mascot button is clicked in header', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    const changeBtn = wrapper.find('[data-testid="change-mascot-btn"]');
    await changeBtn.trigger('click');

    expect(wrapper.emitted('changeOpponent')).toBeTruthy();
  });
});
