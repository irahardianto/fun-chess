import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiGameHud from '../AiGameHud.vue';

describe('AiGameHud.vue', () => {
  it('renders takeback, hint, flip, history, and resign buttons', () => {
    const wrapper = mount(AiGameHud, {
      props: {
        canTakeback: true,
        canAskHint: true,
        takebackCount: 1,
        hintsCount: 2,
        movesCount: 6,
      },
    });

    expect(wrapper.find('[data-testid="takeback-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-btn"]').text()).toContain('Show hint');
    expect(wrapper.find('[data-testid="flip-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="history-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="resign-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="resign-btn"]').classes()).toContain('action-btn--subdued-danger');

    expect(wrapper.classes()).toContain('hud-toolbar');
    expect(wrapper.find('.takeback-badge').text()).toBe('1');
    expect(wrapper.find('.hint-badge').text()).toBe('2');
    expect(wrapper.find('.moves-count').text()).toBe('6');
    expect(wrapper.find('[data-testid="history-btn"]').text()).toContain('Moves (6)');
  });

  it('disables takeback when canTakeback is false or AI is thinking', async () => {
    const wrapper = mount(AiGameHud, {
      props: {
        canTakeback: false,
        canAskHint: true,
        isAiThinking: false,
      },
    });

    const takebackBtn = wrapper.find('[data-testid="takeback-btn"]');
    expect(takebackBtn.attributes('disabled')).toBeDefined();

    await wrapper.setProps({ canTakeback: true, isAiThinking: true });
    expect(takebackBtn.attributes('disabled')).toBeDefined();
  });

  it('emits events when action buttons are clicked', async () => {
    const wrapper = mount(AiGameHud, {
      props: {
        canTakeback: true,
        canAskHint: true,
      },
    });

    await wrapper.find('[data-testid="takeback-btn"]').trigger('click');
    expect(wrapper.emitted('takeback')).toBeTruthy();

    await wrapper.find('[data-testid="hint-btn"]').trigger('click');
    expect(wrapper.emitted('hint')).toBeTruthy();

    await wrapper.find('[data-testid="flip-btn"]').trigger('click');
    expect(wrapper.emitted('flip')).toBeTruthy();

    await wrapper.find('[data-testid="history-btn"]').trigger('click');
    expect(wrapper.emitted('history')).toBeTruthy();

    await wrapper.find('[data-testid="resign-btn"]').trigger('click');
    expect(wrapper.emitted('resign')).toBeTruthy();
  });
});
