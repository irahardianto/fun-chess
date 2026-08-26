import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import App from '../App.vue';
import { ALL_SCENARIOS } from '../features/scenarios/data';

// Mock Socket.io
vi.mock('@/composables/useSocket', () => {
  const { ref } = require('vue');
  return {
    useSocket: () => ({
      socketId: ref('mock-socket-1'),
      isConnected: ref(false),
      currentRoom: ref(null),
      currentPlayer: ref(null),
      drawOfferedBy: ref(null),
      rematchRequestedBy: ref(null),
      lastGameOver: ref(null),
      kingInCheck: ref(false),
      connect: vi.fn(),
      createRoom: vi.fn().mockResolvedValue({ success: true }),
      joinRoom: vi.fn().mockResolvedValue({ success: true }),
      makeMove: vi.fn().mockResolvedValue({ success: true, moveResult: { captured: false } }),
      resign: vi.fn(),
      offerDraw: vi.fn(),
      respondDraw: vi.fn(),
      requestRematch: vi.fn(),
      respondRematch: vi.fn(),
      leaveRoom: vi.fn(),
    }),
  };
});

describe('App.vue Shell & Navigation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders app shell with navbar and lobby by default', () => {
    const wrapper = mount(App);

    expect(wrapper.find('[data-testid="app-shell"]').exists()).toBe(true);
    expect(wrapper.find('.app-navbar').exists()).toBe(true);
    expect(wrapper.find('.brand-title').text()).toContain('Fun Chess!');
    expect(wrapper.find('[data-testid="lobby-view"]').exists()).toBe(true);
  });

  it('navigates to Solo AI Arena when mascot challenge is initiated from lobby', async () => {
    const wrapper = mount(App);

    const lobbyView = wrapper.findComponent({ name: 'LobbyView' });
    expect(lobbyView.exists()).toBe(true);

    // Trigger start-solo-ai event
    lobbyView.vm.$emit('start-solo-ai', {
      mascotId: 'peanut',
      playerColor: 'w',
      playerName: 'Hero',
      playerAvatar: '🦁',
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="solo-ai-arena"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="exit-solo-ai-btn"]').exists()).toBe(true);
  });

  it('navigates back to lobby when exit button is clicked in Solo AI mode', async () => {
    const wrapper = mount(App);

    const lobbyView = wrapper.findComponent({ name: 'LobbyView' });
    lobbyView.vm.$emit('start-solo-ai', {
      mascotId: 'peanut',
      playerColor: 'w',
      playerName: 'Hero',
      playerAvatar: '🦁',
    });

    await flushPromises();
    expect(wrapper.find('[data-testid="solo-ai-arena"]').exists()).toBe(true);

    // Click exit button in navbar
    const exitBtn = wrapper.find('[data-testid="exit-solo-ai-btn"]');
    expect(exitBtn.exists()).toBe(true);
    await exitBtn.trigger('click');

    await flushPromises();
    expect(wrapper.find('[data-testid="lobby-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="solo-ai-arena"]').exists()).toBe(false);
  });

  it('navigates to Scenario Arena when a scenario is selected in Chess Academy', async () => {
    const wrapper = mount(App);

    const testScenario = ALL_SCENARIOS[0];
    const lobbyView = wrapper.findComponent({ name: 'LobbyView' });
    lobbyView.vm.$emit('select-scenario', testScenario);

    await flushPromises();

    expect(wrapper.findComponent({ name: 'ScenarioArena' }).exists()).toBe(true);
    expect(wrapper.find('[data-testid="exit-academy-btn"]').exists()).toBe(true);
  });

  it('navigates back to lobby when exit button or back is clicked in Scenario Arena', async () => {
    const wrapper = mount(App);

    const testScenario = ALL_SCENARIOS[0];
    const lobbyView = wrapper.findComponent({ name: 'LobbyView' });
    lobbyView.vm.$emit('select-scenario', testScenario);

    await flushPromises();
    expect(wrapper.findComponent({ name: 'ScenarioArena' }).exists()).toBe(true);

    // Click exit button in navbar
    const exitBtn = wrapper.find('[data-testid="exit-academy-btn"]');
    expect(exitBtn.exists()).toBe(true);
    await exitBtn.trigger('click');

    await flushPromises();
    expect(wrapper.find('[data-testid="lobby-view"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ScenarioArena' }).exists()).toBe(false);
  });

  it('toggles audio mute reactively from navbar button', async () => {
    const wrapper = mount(App);

    const muteBtn = wrapper.find('[data-testid="mute-toggle-btn"]');
    expect(muteBtn.exists()).toBe(true);

    expect(muteBtn.attributes('aria-label')).toBe('Mute audio');
    await muteBtn.trigger('click');
    expect(muteBtn.attributes('aria-label')).toBe('Unmute audio');
  });
});
