import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LobbyModeSelector from '../LobbyModeSelector.vue';

describe('LobbyModeSelector.vue', () => {
  it('renders all 4 mode buttons with appropriate titles and accessibility attributes', () => {
    const wrapper = mount(LobbyModeSelector, {
      props: {
        modelValue: 'multiplayer_lan',
      },
    });

    const tabs = wrapper.findAll('.mode-tab-button');
    expect(tabs).toHaveLength(4);

    const lanTab = wrapper.find('[data-testid="mode-tab-multiplayer_lan"]');
    const soloAiTab = wrapper.find('[data-testid="mode-tab-solo_ai"]');
    const academyTab = wrapper.find('[data-testid="mode-tab-academy"]');
    const puzzleHubTab = wrapper.find('[data-testid="mode-tab-puzzle_hub"]');

    expect(lanTab.exists()).toBe(true);
    expect(soloAiTab.exists()).toBe(true);
    expect(academyTab.exists()).toBe(true);
    expect(puzzleHubTab.exists()).toBe(true);

    expect(lanTab.attributes('aria-selected')).toBe('true');
    expect(soloAiTab.attributes('aria-selected')).toBe('false');
    expect(academyTab.attributes('aria-selected')).toBe('false');
    expect(puzzleHubTab.attributes('aria-selected')).toBe('false');
  });

  it('emits update:modelValue and select when a mode button is clicked', async () => {
    const wrapper = mount(LobbyModeSelector, {
      props: {
        modelValue: 'multiplayer_lan',
      },
    });

    const academyTab = wrapper.find('[data-testid="mode-tab-academy"]');
    await academyTab.trigger('click');

    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['academy']);
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')?.[0]).toEqual(['academy']);
  });
});
