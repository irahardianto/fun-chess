import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PuzzleHubView from '../PuzzleHubView.vue';
import PuzzleHubViewComponent from '../components/PuzzleHubView.vue';
import { InMemoryPuzzleProgressStore } from '../store/in_memory_puzzle_progress.store';

describe('PuzzleHubView.vue Wrapper Component (MIN-027, CRIT-001)', () => {
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

  it('forwards launch-drills event as launchDrills, launch-drills, and launchDrill with theme parameter (CRIT-001)', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: {
        customStore: store,
      },
    });

    const inner = wrapper.findComponent(PuzzleHubViewComponent);
    inner.vm.$emit('launch-drills', 'fork');

    expect(wrapper.emitted('launchDrills')).toBeDefined();
    expect(wrapper.emitted('launchDrills')![0]).toEqual(['fork']);

    expect(wrapper.emitted('launch-drills')).toBeDefined();
    expect(wrapper.emitted('launch-drills')![0]).toEqual(['fork']);

    expect(wrapper.emitted('launchDrill')).toBeDefined();
    expect(wrapper.emitted('launchDrill')![0]).toEqual(['fork']);

    // Also test without theme parameter
    inner.vm.$emit('launch-drills');
    expect(wrapper.emitted('launchDrills')![1]).toEqual([undefined]);
    expect(wrapper.emitted('launch-drills')![1]).toEqual([undefined]);
    expect(wrapper.emitted('launchDrill')![1]).toEqual([undefined]);
  });

  it('forwards launch-ladder event as launchLadder and launch-ladder', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: {
        customStore: store,
      },
    });

    const inner = wrapper.findComponent(PuzzleHubViewComponent);
    inner.vm.$emit('launch-ladder');

    expect(wrapper.emitted('launchLadder')).toBeDefined();
    expect(wrapper.emitted('launchLadder')![0]).toEqual([]);
    expect(wrapper.emitted('launch-ladder')).toBeDefined();
    expect(wrapper.emitted('launch-ladder')![0]).toEqual([]);
  });

  it('forwards launch-rush event as launchRush and launch-rush with mode parameter', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: {
        customStore: store,
      },
    });

    const inner = wrapper.findComponent(PuzzleHubViewComponent);
    inner.vm.$emit('launch-rush', 'streak_survivor');

    expect(wrapper.emitted('launchRush')).toBeDefined();
    expect(wrapper.emitted('launchRush')![0]).toEqual(['streak_survivor']);
    expect(wrapper.emitted('launch-rush')).toBeDefined();
    expect(wrapper.emitted('launch-rush')![0]).toEqual(['streak_survivor']);

    inner.vm.$emit('launch-rush', 'puzzle_rush');
    expect(wrapper.emitted('launchRush')![1]).toEqual(['puzzle_rush']);
    expect(wrapper.emitted('launch-rush')![1]).toEqual(['puzzle_rush']);
  });

  it('forwards back-to-lobby event as backToLobby and back-to-lobby', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleHubView, {
      props: {
        customStore: store,
      },
    });

    const inner = wrapper.findComponent(PuzzleHubViewComponent);
    inner.vm.$emit('back-to-lobby');

    expect(wrapper.emitted('backToLobby')).toBeDefined();
    expect(wrapper.emitted('backToLobby')![0]).toEqual([]);
    expect(wrapper.emitted('back-to-lobby')).toBeDefined();
    expect(wrapper.emitted('back-to-lobby')![0]).toEqual([]);
  });
});
