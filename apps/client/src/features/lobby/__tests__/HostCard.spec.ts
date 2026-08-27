import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HostCard from '../HostCard.vue';

describe('HostCard.vue (Accessibility & Interactions)', () => {
  it('renders title, nickname input, radiogroup for color, and verb-first Host Game button', () => {
    const wrapper = mount(HostCard);

    expect(wrapper.find('[data-testid="host-card"]').exists()).toBe(true);
    expect(wrapper.find('.card-title').text()).toBe('Start a New Game');
    expect(wrapper.find('.card-badge').text()).toContain('Host Match');

    const input = wrapper.find('[data-testid="host-nickname-input"]');
    expect(input.exists()).toBe(true);
    expect(input.find('label').text()).toBe('Your Nickname');

    const radiogroup = wrapper.find('[role="radiogroup"]');
    expect(radiogroup.exists()).toBe(true);
    expect(radiogroup.attributes('aria-label')).toBe('Choose your piece color');

    const hostBtn = wrapper.find('[data-testid="host-game-btn"]');
    expect(hostBtn.exists()).toBe(true);
    expect(hostBtn.text()).toContain('Host Game');
  });

  it('selects preferred piece color using radio options and updates aria-checked', async () => {
    const wrapper = mount(HostCard);

    const whiteBtn = wrapper.find('[data-testid="color-white-btn"]');
    const randomBtn = wrapper.find('[data-testid="color-random-btn"]');
    const blackBtn = wrapper.find('[data-testid="color-black-btn"]');

    expect(randomBtn.attributes('aria-checked')).toBe('true');
    expect(whiteBtn.attributes('aria-checked')).toBe('false');

    await whiteBtn.trigger('click');
    expect(whiteBtn.attributes('aria-checked')).toBe('true');
    expect(randomBtn.attributes('aria-checked')).toBe('false');

    await blackBtn.trigger('click');
    expect(blackBtn.attributes('aria-checked')).toBe('true');
    expect(whiteBtn.attributes('aria-checked')).toBe('false');
  });

  it('validates empty nickname and shows error with aria-invalid on input', async () => {
    const wrapper = mount(HostCard);

    const hostBtn = wrapper.find('[data-testid="host-game-btn"]');
    await hostBtn.trigger('click');

    expect(wrapper.emitted('host')).toBeUndefined();
    const inputGroup = wrapper.find('[data-testid="host-nickname-input"]');
    expect(inputGroup.find('.base-input-error').text()).toContain('Enter your nickname to host a match.');
    expect(inputGroup.find('input').attributes('aria-invalid')).toBe('true');
  });

  it('emits host event when valid nickname is entered and submitted', async () => {
    const wrapper = mount(HostCard);

    const input = wrapper.find('[data-testid="host-nickname-input"] input');
    await input.setValue('  GrandmasterLeo 🦁  ');

    const whiteBtn = wrapper.find('[data-testid="color-white-btn"]');
    await whiteBtn.trigger('click');

    const hostBtn = wrapper.find('[data-testid="host-game-btn"]');
    await hostBtn.trigger('click');

    expect(wrapper.emitted('host')).toHaveLength(1);
    expect(wrapper.emitted('host')?.[0]).toEqual([
      {
        playerName: 'GrandmasterLeo 🦁',
        preferredColor: 'w',
      },
    ]);
  });

  it('emits host event when submitting the form directly (e.g. Enter key)', async () => {
    const wrapper = mount(HostCard);

    const input = wrapper.find('[data-testid="host-nickname-input"] input');
    await input.setValue('KnightTester 🛡️');

    const form = wrapper.find('form.host-form');
    expect(form.exists()).toBe(true);
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('host')).toHaveLength(1);
    expect((wrapper.emitted('host')?.[0] as any[])?.[0]?.playerName).toBe('KnightTester 🛡️');
  });
});
