import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PuzzleHubView from '../PuzzleHubView.vue';
import { InMemoryPuzzleProgressStore } from '../../store/in_memory_puzzle_progress.store';

describe('PuzzleHubView.vue', () => {
  it('renders global stats bar and the 3 mode cards', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: { customStore: store },
    });

    expect(wrapper.find('[data-testid="puzzle-hub-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="global-stats-bar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-card-drills"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="adaptive-ladder-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-card-rush"]').exists()).toBe(true);
  });

  it('switches to drills browser when exploring skill drills', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: { customStore: store },
    });

    const exploreBtn = wrapper.find('[data-testid="drills-explore-btn"]');
    await exploreBtn.trigger('click');

    expect(wrapper.find('[data-testid="drills-browser-section"]').exists()).toBe(true);

    const backBtn = wrapper.find('[data-testid="back-to-hub-btn"]');
    await backBtn.trigger('click');

    expect(wrapper.find('[data-testid="mode-cards-grid"]').exists()).toBe(true);
  });

  it('emits launchRush events for blitz and survivor', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: { customStore: store },
    });

    const blitzBtn = wrapper.find('[data-testid="start-rush-blitz-btn"]');
    await blitzBtn.trigger('click');
    expect(wrapper.emitted('launchRush')![0]).toEqual(['puzzle_rush']);

    const survivorBtn = wrapper.find('[data-testid="start-rush-survivor-btn"]');
    await survivorBtn.trigger('click');
    expect(wrapper.emitted('launchRush')![1]).toEqual(['streak_survivor']);
  });
});
