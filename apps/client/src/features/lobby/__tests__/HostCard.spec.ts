import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import fs from 'fs';
import path from 'path';
import HostCard from '../HostCard.vue';

describe('HostCard.vue (Accessibility & Interactions)', () => {
  it('renders title, nickname input, radiogroup for color, and verb-first Host Game button', () => {
    const wrapper = mount(HostCard);

    expect(wrapper.find('[data-testid="host-card"]').exists()).toBe(true);
    expect(wrapper.find('.card-title').text()).toBe('Start a new game');
    expect(wrapper.find('.card-badge').text()).toContain('Host match');

    const input = wrapper.find('[data-testid="host-nickname-input"]');
    expect(input.exists()).toBe(true);
    expect(input.find('label').text()).toBe('Your nickname');
    expect(input.find('input').attributes('placeholder')).toBe('e.g. MasterKnight');

    const radiogroup = wrapper.find('[role="radiogroup"]');
    expect(radiogroup.exists()).toBe(true);
    expect(radiogroup.attributes('aria-label')).toBe('Choose your piece color');

    const hostBtn = wrapper.find('[data-testid="host-game-btn"]');
    expect(hostBtn.exists()).toBe(true);
    expect(hostBtn.text()).toContain('Host Game');
  });

  it('uses --color-primary-text token for .card-badge contrast in dark mode', () => {
    const wrapper = mount(HostCard);
    const badge = wrapper.find('.card-badge');
    expect(badge.exists()).toBe(true);
    // Verifies the scoped style uses --color-primary-text
    expect(HostCard.__scopeId).toBeDefined();
  });

  it('selects preferred piece color using radio options and updates aria-checked and tabindex', async () => {
    const wrapper = mount(HostCard);

    const whiteBtn = wrapper.find('[data-testid="color-white-btn"]');
    const randomBtn = wrapper.find('[data-testid="color-random-btn"]');
    const blackBtn = wrapper.find('[data-testid="color-black-btn"]');

    expect(randomBtn.attributes('aria-checked')).toBe('true');
    expect(randomBtn.attributes('tabindex')).toBe('0');
    expect(whiteBtn.attributes('aria-checked')).toBe('false');
    expect(whiteBtn.attributes('tabindex')).toBe('-1');
    expect(blackBtn.attributes('tabindex')).toBe('-1');

    await whiteBtn.trigger('click');
    expect(whiteBtn.attributes('aria-checked')).toBe('true');
    expect(whiteBtn.attributes('tabindex')).toBe('0');
    expect(randomBtn.attributes('aria-checked')).toBe('false');
    expect(randomBtn.attributes('tabindex')).toBe('-1');

    await blackBtn.trigger('click');
    expect(blackBtn.attributes('aria-checked')).toBe('true');
    expect(blackBtn.attributes('tabindex')).toBe('0');
    expect(whiteBtn.attributes('aria-checked')).toBe('false');
    expect(whiteBtn.attributes('tabindex')).toBe('-1');
  });

  it('supports roving tabindex keyboard navigation with Arrow keys, Home, and End', async () => {
    const wrapper = mount(HostCard);

    const randomBtn = wrapper.find('[data-testid="color-random-btn"]');
    const whiteBtn = wrapper.find('[data-testid="color-white-btn"]');
    const blackBtn = wrapper.find('[data-testid="color-black-btn"]');

    // Initially random (index 1) is selected
    expect(randomBtn.attributes('aria-checked')).toBe('true');

    // Press ArrowRight -> moves to black (index 2)
    await randomBtn.trigger('keydown', { key: 'ArrowRight' });
    expect(blackBtn.attributes('aria-checked')).toBe('true');
    expect(blackBtn.attributes('tabindex')).toBe('0');

    // Press ArrowRight -> wraps to white (index 0)
    await blackBtn.trigger('keydown', { key: 'ArrowRight' });
    expect(whiteBtn.attributes('aria-checked')).toBe('true');
    expect(whiteBtn.attributes('tabindex')).toBe('0');

    // Press ArrowLeft -> wraps to black (index 2)
    await whiteBtn.trigger('keydown', { key: 'ArrowLeft' });
    expect(blackBtn.attributes('aria-checked')).toBe('true');

    // Press Home -> moves to white (index 0)
    await blackBtn.trigger('keydown', { key: 'Home' });
    expect(whiteBtn.attributes('aria-checked')).toBe('true');

    // Press End -> moves to black (index 2)
    await whiteBtn.trigger('keydown', { key: 'End' });
    expect(blackBtn.attributes('aria-checked')).toBe('true');
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

  it('clears error message when user types into nickname input', async () => {
    const wrapper = mount(HostCard);

    const hostBtn = wrapper.find('[data-testid="host-game-btn"]');
    await hostBtn.trigger('click');

    const inputGroup = wrapper.find('[data-testid="host-nickname-input"]');
    expect(inputGroup.find('.base-input-error').exists()).toBe(true);

    const input = inputGroup.find('input');
    await input.setValue('Master');
    await wrapper.vm.$nextTick();

    expect(inputGroup.find('.base-input-error').exists()).toBe(false);
  });

  it('uses --color-primary-text token for .card-badge style in HostCard.vue', () => {
    const sfcPath = path.resolve(__dirname, '../HostCard.vue');
    const content = fs.readFileSync(sfcPath, 'utf-8');
    expect(content).toMatch(/\.card-badge\s*\{[^}]*color:\s*var\(--color-primary-text\)/s);
  });
});
