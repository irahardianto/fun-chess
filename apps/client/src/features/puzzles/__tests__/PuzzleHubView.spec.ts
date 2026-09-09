import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PuzzleHubView from '../PuzzleHubView.vue';
import PuzzleHubViewComponent from '../components/PuzzleHubView.vue';
import { InMemoryPuzzleProgressStore } from '../store/in_memory_puzzle_progress.store';

describe('PuzzleHubView.vue Wrapper Component (MIN-027)', () => {
  it('renders the inner PuzzleHubViewComponent with customStore prop', () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: {
        customStore: store,
      },
    });

    const inner = wrapper.findComponent(PuzzleHubViewComponent);
    expect(inner.exists()).toBe(true);
    expect(inner.props('customStore')).toEqual(store);
  });

  it('forwards launch-drills event as launchDrill with theme parameter', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: {
        customStore: store,
      },
    });

    const inner = wrapper.findComponent(PuzzleHubViewComponent);
    inner.vm.$emit('launchDrills', 'fork');

    expect(wrapper.emitted('launchDrill')).toBeDefined();
    expect(wrapper.emitted('launchDrill')![0]).toEqual(['fork']);
  });

  it('forwards launch-ladder event as launchLadder', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: {
        customStore: store,
      },
    });

    const inner = wrapper.findComponent(PuzzleHubViewComponent);
    inner.vm.$emit('launchLadder');

    expect(wrapper.emitted('launchLadder')).toBeDefined();
    expect(wrapper.emitted('launchLadder')![0]).toEqual([]);
  });

  it('forwards launch-rush event as launchRush with mode parameter', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: {
        customStore: store,
      },
    });

    const inner = wrapper.findComponent(PuzzleHubViewComponent);
    inner.vm.$emit('launchRush', 'streak_survivor');

    expect(wrapper.emitted('launchRush')).toBeDefined();
    expect(wrapper.emitted('launchRush')![0]).toEqual(['streak_survivor']);

    inner.vm.$emit('launchRush', 'puzzle_rush');
    expect(wrapper.emitted('launchRush')![1]).toEqual(['puzzle_rush']);
  });
});
