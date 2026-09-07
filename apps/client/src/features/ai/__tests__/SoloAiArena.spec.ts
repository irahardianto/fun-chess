import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SoloAiArena from '../SoloAiArena.vue';

// Mock confetti
vi.mock('@/composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrate: vi.fn(),
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

  it('renders higher difficulty mascot opponent when initialMascotId is changed', () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'owl',
        playerName: 'Kid Champion',
      },
    });

    expect(wrapper.find('.opponent-name-tag').text()).toContain('Owl');
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

  it('toggles audio mute when arena mute button is clicked', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    const muteBtn = wrapper.find('[data-testid="arena-mute-btn"]');
    expect(muteBtn.exists()).toBe(true);

    const initialLabel = muteBtn.attributes('aria-label');
    await muteBtn.trigger('click');
    await flushPromises();

    expect(muteBtn.attributes('aria-label')).not.toBe(initialLabel);
  });

  it('displays active hint banner when hint is requested and clears it on dismiss', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    expect(wrapper.find('[data-testid="active-hint-banner"]').exists()).toBe(false);

    const hud = wrapper.findComponent({ name: 'AiGameHud' });
    hud.vm.$emit('hint');
    await flushPromises();

    const hintBanner = wrapper.find('[data-testid="active-hint-banner"]');
    expect(hintBanner.exists()).toBe(true);
    expect(hintBanner.find('.hint-banner-text').text().length).toBeGreaterThan(0);

    const closeBtn = hintBanner.find('.hint-close-btn');
    await closeBtn.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="active-hint-banner"]').exists()).toBe(false);
  });

  it('handles move takeback undo when triggered from HUD', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    const hud = wrapper.findComponent({ name: 'AiGameHud' });
    expect(hud.exists()).toBe(true);

    await hud.vm.$emit('takeback');
    await flushPromises();
  });

  it('handles board flipping when triggered from HUD', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    const hud = wrapper.findComponent({ name: 'AiGameHud' });
    const board = wrapper.findComponent({ name: 'ChessBoard' });
    const initialOrientation = board.props('orientation');

    await hud.vm.$emit('flip');
    await flushPromises();

    expect(board.props('orientation')).not.toBe(initialOrientation);
  });

  it('toggles move history drawer when history button is clicked in HUD', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    expect(wrapper.find('.history-container').exists()).toBe(false);

    const hud = wrapper.findComponent({ name: 'AiGameHud' });
    await hud.vm.$emit('history');
    await flushPromises();

    expect(wrapper.find('.history-container').exists()).toBe(true);

    await hud.vm.$emit('history');
    await flushPromises();

    expect(wrapper.find('.history-container').exists()).toBe(false);
  });

  it('forwards board square clicks and moves', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    const board = wrapper.findComponent({ name: 'ChessBoard' });
    await board.vm.$emit('select', 'e2');
    await flushPromises();

    await board.vm.$emit('move', { from: 'e2', to: 'e4' });
    await flushPromises();
  });

  it('forwards pawn promotion selection and cancellation', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
    });

    const promotionModal = wrapper.findComponent({ name: 'PromotionModal' });
    await promotionModal.vm.$emit('select', 'q');
    await promotionModal.vm.$emit('cancel');
    await flushPromises();
  });

  it('handles resign match modal cancellation', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
      global: {
        stubs: { Teleport: true },
      },
    });

    const hud = wrapper.findComponent({ name: 'AiGameHud' });
    await hud.vm.$emit('resign');
    await flushPromises();

    const resignModal = wrapper.findAllComponents({ name: 'BaseModal' }).find((m) => m.props('title') === 'Resign Match?');
    expect(resignModal).toBeDefined();
    expect(resignModal!.props('modelValue')).toBe(true);

    // Cancel via keep playing button
    const cancelBtn = resignModal!.findAll('button').find((b) => b.text().includes('Keep Playing'));
    expect(cancelBtn?.exists()).toBe(true);
    await cancelBtn!.trigger('click');
    await flushPromises();

    expect(resignModal!.props('modelValue')).toBe(false);

    // Cancel via BaseModal close event
    await hud.vm.$emit('resign');
    await flushPromises();
    await resignModal!.vm.$emit('close');
    await flushPromises();

    expect(resignModal!.props('modelValue')).toBe(false);
  });

  it('handles resign match confirmation, game over modal, and rematch workflow', async () => {
    const wrapper = mount(SoloAiArena, {
      props: {
        initialMascotId: 'peanut',
      },
      global: {
        stubs: { Teleport: true },
      },
    });

    // 1. Open resign modal
    const hud = wrapper.findComponent({ name: 'AiGameHud' });
    await hud.vm.$emit('resign');
    await flushPromises();

    // 2. Confirm resignation
    const confirmBtn = wrapper.find('[data-testid="confirm-resign-btn"]');
    expect(confirmBtn.exists()).toBe(true);
    await confirmBtn.trigger('click');
    await flushPromises();

    // 3. Game Over modal should now be displayed
    const gameOverModal = wrapper.findComponent({ name: 'AiGameOverModal' });
    expect(gameOverModal.exists()).toBe(true);

    // 4. Test GameOverModal events: change-opponent, lobby, close, rematch
    await gameOverModal.vm.$emit('change-opponent');
    expect(wrapper.emitted('changeOpponent')).toBeTruthy();

    await gameOverModal.vm.$emit('lobby');
    expect(wrapper.emitted('exit')).toBeTruthy();
    expect(wrapper.emitted('lobby')).toBeTruthy();

    await gameOverModal.vm.$emit('close');
    await flushPromises();
    expect(gameOverModal.props('modelValue')).toBe(false);

    await gameOverModal.vm.$emit('rematch');
    await flushPromises();
  });
});
