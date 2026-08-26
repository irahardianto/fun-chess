import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ThemeDrillSelector from '../ThemeDrillSelector.vue';

describe('ThemeDrillSelector.vue', () => {
  it('renders theme cards and filters by category', async () => {
    const wrapper = mount(ThemeDrillSelector, {
      props: {
        themeMasteryMap: {
          fork: {
            theme: 'fork',
            attempted: 5,
            solved: 5,
            starsEarned: 15,
            masteryLevel: 'apprentice',
            lastPracticedAt: Date.now(),
          },
        },
      },
    });

    expect(wrapper.find('[data-testid="theme-drill-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-card-fork"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-card-fork"]').text()).toContain('15 Stars');

    // Click filter tab for checkmate_patterns
    const checkmateTab = wrapper.find('[data-testid="filter-tab-checkmate_patterns"]');
    await checkmateTab.trigger('click');

    expect(wrapper.find('[data-testid="theme-card-mate_in_1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-card-fork"]').exists()).toBe(false);
  });

  it('emits selectTheme on clicking a theme card', async () => {
    const wrapper = mount(ThemeDrillSelector);
    const forkCard = wrapper.find('[data-testid="theme-card-fork"]');
    await forkCard.trigger('click');

    expect(wrapper.emitted('selectTheme')).toBeTruthy();
    expect(wrapper.emitted('selectTheme')![0]).toEqual(['fork']);
  });
});
