import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import fs from 'fs';
import path from 'path';
import App from '../App.vue';
import { ALL_SCENARIOS } from '../features/scenarios/data';

// Mock Socket.io state
const mockSocketId = ref('mock-socket-1');
const mockIsConnected = ref(false);
const mockCurrentRoom = ref<any>(null);
const mockCurrentPlayer = ref<any>(null);
const mockDrawOfferedBy = ref<any>(null);
const mockRematchRequestedBy = ref<any>(null);
const mockLastGameOver = ref<any>(null);
const mockKingInCheck = ref(false);
const mockOfferDraw = vi.fn();
const mockRespondDraw = vi.fn();
const mockRequestRematch = vi.fn();
const mockRespondRematch = vi.fn();

vi.mock('@/composables/useSocket', () => {
  return {
    useSocket: () => ({
      socketId: mockSocketId,
      isConnected: mockIsConnected,
      currentRoom: mockCurrentRoom,
      currentPlayer: mockCurrentPlayer,
      drawOfferedBy: mockDrawOfferedBy,
      rematchRequestedBy: mockRematchRequestedBy,
      lastGameOver: mockLastGameOver,
      kingInCheck: mockKingInCheck,
      connect: vi.fn(),
      createRoom: vi.fn().mockResolvedValue({ success: true }),
      joinRoom: vi.fn().mockResolvedValue({ success: true }),
      makeMove: vi.fn().mockResolvedValue({ success: true, moveResult: { captured: false } }),
      resign: vi.fn(),
      offerDraw: mockOfferDraw,
      respondDraw: mockRespondDraw,
      requestRematch: mockRequestRematch,
      respondRematch: mockRespondRematch,
      leaveRoom: vi.fn(),
    }),
  };
});

describe('App.vue Shell & Navigation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocketId.value = 'mock-socket-1';
    mockIsConnected.value = false;
    mockCurrentRoom.value = null;
    mockCurrentPlayer.value = null;
    mockDrawOfferedBy.value = null;
    mockRematchRequestedBy.value = null;
    mockLastGameOver.value = null;
    mockKingInCheck.value = false;
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

  it('renders navbar-brand as a semantic button with accessible label and navigates to lobby on click', async () => {
    const wrapper = mount(App);

    const brandBtn = wrapper.find('button.navbar-brand');
    expect(brandBtn.exists()).toBe(true);
    expect(brandBtn.attributes('type')).toBe('button');
    expect(brandBtn.attributes('aria-label')).toBe('Fun Chess Home');

    // Start Solo AI mode
    const lobbyView = wrapper.findComponent({ name: 'LobbyView' });
    lobbyView.vm.$emit('start-solo-ai', {
      mascotId: 'peanut',
      playerColor: 'w',
      playerName: 'Hero',
      playerAvatar: '🦁',
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="solo-ai-arena"]').exists()).toBe(true);

    // Click brand button to return to lobby
    await brandBtn.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="lobby-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="solo-ai-arena"]').exists()).toBe(false);
  });

  it('suppresses transitions when toggling theme to prevent visual smearing', async () => {
    const wrapper = mount(App);

    const themeBtn = wrapper.find('button[aria-label*="mode"]');
    expect(themeBtn.exists()).toBe(true);

    await themeBtn.trigger('click');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Toggle back to light mode
    await themeBtn.trigger('click');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('displays accessible inline notifications with dismiss capability', async () => {
    const wrapper = mount(App);

    // Trigger error notification via internal method
    (wrapper.vm as any).showNotification('Test error message', 'error', 3000);
    await wrapper.vm.$nextTick();

    const banner = wrapper.find('[data-testid="app-notification-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.classes()).toContain('is-error');
    expect(banner.attributes('role')).toBe('alert');
    expect(banner.text()).toContain('Test error message');

    // Dismiss notification
    const dismissBtn = wrapper.find('.notification-dismiss-btn');
    expect(dismissBtn.exists()).toBe(true);
    expect(dismissBtn.attributes('aria-label')).toBe('Dismiss notification');
    await dismissBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="app-notification-banner"]').exists()).toBe(false);
  });

  it('renders disconnect-warning-banner when multiplayer match is paused due to opponent disconnect', async () => {
    mockCurrentPlayer.value = { id: 'p1', name: 'White Player', color: 'w', socketId: 'mock-socket-1' };
    mockCurrentRoom.value = {
      roomCode: 'ROOM12',
      status: 'paused_disconnect',
      hostId: 'p1',
      whitePlayer: { id: 'p1', name: 'White Player', color: 'w', socketId: 'mock-socket-1', isConnected: true },
      blackPlayer: { id: 'p2', name: 'Black Player', color: 'b', socketId: 'mock-socket-2', isConnected: false },
      game: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moves: [],
        capturedWhite: [],
        capturedBlack: [],
      },
    };

    const wrapper = mount(App);
    await flushPromises();

    const disconnectBanner = wrapper.find('.disconnect-warning-banner');
    expect(disconnectBanner.exists()).toBe(true);
    expect(disconnectBanner.text()).toContain('Opponent disconnected!');
  });

  it('renders draw-offer-banner and handles accept and decline buttons', async () => {
    mockCurrentPlayer.value = { id: 'p1', name: 'White Player', color: 'w', socketId: 'mock-socket-1' };
    mockCurrentRoom.value = {
      roomCode: 'ROOM12',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: { id: 'p1', name: 'White Player', color: 'w', socketId: 'mock-socket-1', isConnected: true },
      blackPlayer: { id: 'p2', name: 'Black Player', color: 'b', socketId: 'mock-socket-2', isConnected: true },
      game: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        moves: [],
        capturedWhite: [],
        capturedBlack: [],
      },
    };
    mockDrawOfferedBy.value = {
      fromPlayerId: 'p2',
      fromPlayerName: 'Black Player',
    };

    const wrapper = mount(App);
    await flushPromises();

    const drawBanner = wrapper.find('.draw-offer-banner');
    expect(drawBanner.exists()).toBe(true);
    expect(drawBanner.text()).toContain('Black Player offered a peaceful draw!');

    // Test accept draw
    const buttons = drawBanner.findAllComponents({ name: 'BaseButton' });
    const acceptBtn = buttons.find((b: any) => b.text().includes('Accept Draw'));
    expect(acceptBtn?.exists()).toBe(true);
    await acceptBtn!.trigger('click');
    expect(mockRespondDraw).toHaveBeenCalledWith('ROOM12', true);

    // Test decline draw
    const declineBtn = buttons.find((b: any) => b.text().includes('Decline'));
    expect(declineBtn?.exists()).toBe(true);
    await declineBtn!.trigger('click');
    expect(mockRespondDraw).toHaveBeenCalledWith('ROOM12', false);
  });

  it('verifies Zero-CLS CSS rules for banners in App.vue', () => {
    const appVueContent = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf-8');

    // app-notification-banner fixed overlay
    expect(appVueContent).toMatch(/\.app-notification-banner\s*\{[^}]*position:\s*fixed;/);
    expect(appVueContent).toMatch(/\.app-notification-banner\s*\{[^}]*top:\s*68px;/);
    expect(appVueContent).toMatch(/\.app-notification-banner\s*\{[^}]*z-index:\s*var\(--z-global-notification,\s*100\);/);

    // game-arena-container relative positioning
    expect(appVueContent).toMatch(/\.game-arena-container\s*\{[^}]*position:\s*relative;/);

    // disconnect-warning-banner absolute overlay
    expect(appVueContent).toMatch(/\.disconnect-warning-banner\s*\{[^}]*position:\s*absolute;/);
    expect(appVueContent).toMatch(/\.disconnect-warning-banner\s*\{[^}]*top:\s*8px;/);
    expect(appVueContent).toMatch(/\.disconnect-warning-banner\s*\{[^}]*z-index:\s*var\(--z-overlay-alert,\s*30\);/);

    // draw-offer-banner absolute overlay
    expect(appVueContent).toMatch(/\.draw-offer-banner\s*\{[^}]*position:\s*absolute;/);
    expect(appVueContent).toMatch(/\.draw-offer-banner\s*\{[^}]*top:\s*8px;/);
    expect(appVueContent).toMatch(/\.draw-offer-banner\s*\{[^}]*z-index:\s*var\(--z-overlay-alert,\s*30\);/);
  });
});


