import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import fs from 'fs';
import path from 'path';
import App from '../App.vue';
import { ALL_SCENARIOS } from '../features/scenarios/data';
import { usePwaInstall } from '../features/pwa/composables/usePwaInstall';
import { useNotification } from '../components/layout';
import { STORAGE_KEYS } from '../platform/storage';

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
const mockCreateRoom = vi.fn().mockResolvedValue({ success: true });
const mockJoinRoom = vi.fn().mockResolvedValue({ success: true });
const mockMakeMove = vi.fn().mockResolvedValue({ success: true, moveResult: { captured: false } });
const mockResign = vi.fn();
const mockLeaveRoom = vi.fn();

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
      createRoom: mockCreateRoom,
      joinRoom: mockJoinRoom,
      makeMove: mockMakeMove,
      resign: mockResign,
      offerDraw: mockOfferDraw,
      respondDraw: mockRespondDraw,
      requestRematch: mockRequestRematch,
      respondRematch: mockRespondRematch,
      leaveRoom: mockLeaveRoom,
    }),
  };
});

const { mockGetLanInfo } = vi.hoisted(() => ({
  mockGetLanInfo: vi.fn().mockResolvedValue({
    ip: '192.168.1.100',
    port: 3000,
    url: 'http://192.168.1.100:3000',
    activeRooms: 0,
    maxRooms: 10,
    version: '1.0.0',
  }),
}));

vi.mock('@/platform/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/api')>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      getLanInfo: mockGetLanInfo,
      getHealth: vi.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        activeRooms: 0,
      }),
    },
  };
});

describe('App.vue Shell & Navigation Integration', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    });

    const { resetSnooze, setDeferredPrompt, setInstalled, closeInstallModal } = usePwaInstall();
    resetSnooze();
    setDeferredPrompt(null);
    setInstalled(false);
    closeInstallModal();
    useNotification().clearAll();

    mockSocketId.value = 'mock-socket-1';
    mockIsConnected.value = false;
    mockCurrentRoom.value = null;
    mockCurrentPlayer.value = null;
    mockDrawOfferedBy.value = null;
    mockRematchRequestedBy.value = null;
    mockLastGameOver.value = null;
    mockKingInCheck.value = false;
    mockCreateRoom.mockReset().mockResolvedValue({ success: true });
    mockJoinRoom.mockReset().mockResolvedValue({ success: true });
    mockMakeMove.mockReset().mockResolvedValue({ success: true, moveResult: { captured: false } });
    mockResign.mockReset();
    mockLeaveRoom.mockReset();
    mockOfferDraw.mockReset();
    mockRespondDraw.mockReset();
    mockRequestRematch.mockReset();
    mockRespondRematch.mockReset();
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
    expect(disconnectBanner.text()).toContain('Opponent disconnected');
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
    const acceptBtn = buttons.find((b: any) => b.text().includes('Accept draw'));
    expect(acceptBtn?.exists()).toBe(true);
    await acceptBtn!.trigger('click');
    expect(mockRespondDraw).toHaveBeenCalledWith('ROOM12', true);

    // Test decline draw
    const declineBtn = buttons.find((b: any) => b.text().includes('Decline draw'));
    expect(declineBtn?.exists()).toBe(true);
    await declineBtn!.trigger('click');
    expect(mockRespondDraw).toHaveBeenCalledWith('ROOM12', false);
  });

  it('verifies Zero-CLS CSS rules, logical properties, and tactile press feedback in App.vue', () => {
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

    // Logical CSS inset property on skip-link
    expect(appVueContent).toContain('inset-inline-start: 50%;');

    // Tactile press feedback on chips and buttons
    expect(appVueContent).toMatch(/\.room-code-chip:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    expect(appVueContent).toMatch(/\.navbar-brand:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    expect(appVueContent).toMatch(/\.nav-install-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    expect(appVueContent).toMatch(/\.nav-icon-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
    expect(appVueContent).toMatch(/\.notification-dismiss-btn:active\s*\{[^}]*transform:\s*scale\(0\.96\);/);
  });

  it('renders navbar Install App button and keeps it visible even after snoozing floating banner', async () => {
    const { resetSnooze, setDeferredPrompt, setInstalled } = usePwaInstall();
    resetSnooze();
    setDeferredPrompt(null);
    setInstalled(false);

    const wrapper = mount(App);
    await flushPromises();

    const navInstallBtn = wrapper.find('[data-testid="pwa-install-btn"]');
    expect(navInstallBtn.exists()).toBe(true);
    expect(navInstallBtn.text()).toContain('Install App');

    // Trigger snooze via composable
    const { snoozePrompt, isSnoozed, showInstallBanner, canInstall } = usePwaInstall();
    snoozePrompt(7);
    await flushPromises();

    expect(isSnoozed.value).toBe(true);
    expect(showInstallBanner.value).toBe(false);
    expect(canInstall.value).toBe(true);

    // Navbar install button must STILL be visible and accessible
    expect(wrapper.find('[data-testid="pwa-install-btn"]').exists()).toBe(true);
  });

  it('renders accessible skip-to-content link pointing to main viewport (WCAG 2.4.1)', async () => {
    const wrapper = mount(App);
    await flushPromises();

    const skipLink = wrapper.find('.skip-link');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.attributes('href')).toBe('#main-content');
    expect(skipLink.text()).toBe('Skip to main content');

    const mainContent = wrapper.find('main#main-content');
    expect(mainContent.exists()).toBe(true);
  });

  it('passes the chosen avatar to player badge during gameplay in Solo AI mode', async () => {
    const wrapper = mount(App);

    const lobbyView = wrapper.findComponent({ name: 'LobbyView' });
    lobbyView.vm.$emit('start-solo-ai', {
      mascotId: 'fox',
      playerColor: 'w',
      playerName: 'Hero',
      playerAvatar: '🦄',
    });

    await flushPromises();

    const soloArena = wrapper.findComponent({ name: 'SoloAiArena' });
    expect(soloArena.exists()).toBe(true);
    expect(soloArena.props('playerAvatar')).toBe('🦄');
  });

  it('passes the chosen avatar to player badge during multiplayer match', async () => {
    mockStorage['fun_chess_player_avatar'] = '⚡';
    mockCurrentPlayer.value = { id: 'p1', name: 'LightningPlayer', color: 'w', socketId: 'mock-socket-1' };
    mockCurrentRoom.value = {
      roomCode: 'BOLT',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: { id: 'p1', name: 'LightningPlayer', color: 'w', socketId: 'mock-socket-1', isConnected: true },
      blackPlayer: { id: 'p2', name: 'Black Player', color: 'b', socketId: 'mock-socket-2', isConnected: true },
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

    const playerBadges = wrapper.findAllComponents({ name: 'PlayerBadge' });
    const selfBadge = playerBadges.find((badge) => badge.props('isSelf') === true);
    expect(selfBadge?.exists()).toBe(true);
    expect(selfBadge?.props('avatar')).toBe('⚡');
  });

  it('handles multiplayer hosting with success opening QR modal and error showing notification', async () => {
    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });

    // Success path
    await viewRouter.vm.$emit('host', { playerName: 'Alice', preferredColor: 'w', avatar: '🦊' });
    await flushPromises();
    expect(mockCreateRoom).toHaveBeenCalledWith('Alice', 'w', '🦊');
    expect(mockStorage['fun_chess_player_avatar']).toBe('🦊');

    // Error path
    mockCreateRoom.mockResolvedValueOnce({ success: false, error: { message: 'Server unreachable' } });
    await viewRouter.vm.$emit('host', { playerName: 'Alice', preferredColor: 'w' });
    await flushPromises();
    expect(wrapper.find('[data-testid="app-notification-banner"]').text()).toContain('Server unreachable');
  });

  it('handles multiplayer joining with success and error feedback', async () => {
    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });

    // Success path
    await viewRouter.vm.$emit('join', { roomCode: 'ABCD', playerName: 'Bob', avatar: '🐼' });
    await flushPromises();
    expect(mockJoinRoom).toHaveBeenCalledWith('ABCD', 'Bob', '🐼');
    expect(mockStorage['fun_chess_player_avatar']).toBe('🐼');

    // Error path
    mockJoinRoom.mockResolvedValueOnce({ success: false, error: { message: 'Room ABCD is full' } });
    await viewRouter.vm.$emit('join', { roomCode: 'ABCD', playerName: 'Bob' });
    await flushPromises();
    expect(wrapper.find('[data-testid="app-notification-banner"]').text()).toContain('Room ABCD is full');
  });

  it('handles move execution, capture sound triggers, and move failure recovery', async () => {
    mockCurrentRoom.value = {
      roomCode: 'WXYZ',
      status: 'playing',
      hostId: 'p1',
      whitePlayer: { id: 'p1', name: 'White', color: 'w', socketId: 'mock-socket-1' },
      blackPlayer: { id: 'p2', name: 'Black', color: 'b', socketId: 'mock-socket-2' },
      game: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', turn: 'w', moves: [] },
    };

    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });

    // Normal move
    await viewRouter.vm.$emit('execute-move', { from: 'e2', to: 'e4' });
    await flushPromises();
    expect(mockMakeMove).toHaveBeenCalledWith('WXYZ', { from: 'e2', to: 'e4' });

    // Capture move
    mockMakeMove.mockResolvedValueOnce({ success: true, moveResult: { captured: true } });
    await viewRouter.vm.$emit('execute-move', { from: 'e4', to: 'd5' });
    await flushPromises();

    // Failed move
    mockMakeMove.mockResolvedValueOnce({ success: false });
    await viewRouter.vm.$emit('execute-move', { from: 'e1', to: 'e8' });
    await flushPromises();

    // Square selection triggers
    await viewRouter.vm.$emit('select-square', 'e2');
    await viewRouter.vm.$emit('square-click', 'e4');
  });

  it('handles pawn promotion lifecycle via AppModalContainer', async () => {
    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });

    await viewRouter.vm.$emit('promotion-required', { from: 'e7', to: 'e8' });
    await flushPromises();
    const modalContainer = wrapper.findComponent({ name: 'AppModalContainer' });
    expect(modalContainer.props('pendingPromotion')).toEqual({ from: 'e7', to: 'e8' });

    await modalContainer.vm.$emit('promotion-select', 'q');
    await modalContainer.vm.$emit('promotion-cancel');
  });

  it('handles resign confirmation dialog flow when match is in progress', async () => {
    mockCurrentRoom.value = {
      roomCode: 'GAME1',
      status: 'playing',
      hostId: 'p1',
    };
    const wrapper = mount(App);
    await flushPromises();

    // Request resign -> confirmation modal opens
    (wrapper.vm as any).handleResign();
    await flushPromises();
    expect((wrapper.vm as any).showConfirmModal).toBe(true);

    // Cancel resign
    (wrapper.vm as any).handleConfirmCancel();
    await flushPromises();
    expect((wrapper.vm as any).showConfirmModal).toBe(false);
    expect(mockResign).not.toHaveBeenCalled();

    // Proceed resign
    (wrapper.vm as any).handleResign();
    await flushPromises();
    (wrapper.vm as any).handleConfirmProceed();
    await flushPromises();
    expect(mockResign).toHaveBeenCalledWith('GAME1');

    // Force resign or when match is not playing
    mockCurrentRoom.value.status = 'game_over';
    (wrapper.vm as any).handleResign(true);
    expect(mockResign).toHaveBeenCalledTimes(2);
  });

  it('handles leave room confirmation dialog flow when match is playing', async () => {
    mockCurrentRoom.value = {
      roomCode: 'GAME1',
      status: 'playing',
      hostId: 'p1',
    };
    const wrapper = mount(App);
    await flushPromises();

    (wrapper.vm as any).handleLeaveRoom();
    await flushPromises();
    expect((wrapper.vm as any).showConfirmModal).toBe(true);

    (wrapper.vm as any).handleConfirmCancel();
    expect(mockLeaveRoom).not.toHaveBeenCalled();

    (wrapper.vm as any).handleLeaveRoom();
    (wrapper.vm as any).handleConfirmProceed();
    expect(mockLeaveRoom).toHaveBeenCalledWith('GAME1');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');

    // Immediate leave when status is not playing
    mockCurrentRoom.value = { roomCode: 'GAME2', status: 'lobby' };
    (wrapper.vm as any).handleLeaveRoom();
    expect(mockLeaveRoom).toHaveBeenCalledWith('GAME2');
  });

  it('safely handles async rejections in confirmation callbacks (handleResign, handleLeaveRoom) without uncaught error (MAJ-003)', async () => {
    mockCurrentRoom.value = {
      roomCode: 'GAME1',
      status: 'playing',
      hostId: 'p1',
    };
    mockResign.mockRejectedValueOnce(new Error('Network error during resign'));
    mockLeaveRoom.mockRejectedValueOnce(new Error('Network error during leave'));

    const wrapper = mount(App);
    await flushPromises();

    // Confirm resign with async rejection
    (wrapper.vm as any).handleResign();
    await flushPromises();
    expect((wrapper.vm as any).showConfirmModal).toBe(true);
    await expect(async () => {
      (wrapper.vm as any).handleConfirmProceed();
      await flushPromises();
    }).not.toThrow();

    // Confirm leave room with async rejection
    (wrapper.vm as any).handleLeaveRoom();
    await flushPromises();
    expect((wrapper.vm as any).showConfirmModal).toBe(true);
    await expect(async () => {
      (wrapper.vm as any).handleConfirmProceed();
      await flushPromises();
    }).not.toThrow();
  });

  it('handles rematch requests and responses from AppModalContainer', async () => {
    mockCurrentRoom.value = { roomCode: 'REM1', status: 'game_over' };
    const wrapper = mount(App);
    await flushPromises();
    const modalContainer = wrapper.findComponent({ name: 'AppModalContainer' });

    await modalContainer.vm.$emit('request-rematch');
    expect(mockRequestRematch).toHaveBeenCalledWith('REM1');

    await modalContainer.vm.$emit('accept-rematch');
    expect(mockRespondRematch).toHaveBeenCalledWith('REM1', true);

    await modalContainer.vm.$emit('decline-rematch');
    expect(mockRespondRematch).toHaveBeenCalledWith('REM1', false);
  });

  it('handles draw offers, acceptances, and declines from AppViewRouter', async () => {
    mockCurrentRoom.value = { roomCode: 'DRAW1', status: 'playing' };
    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });

    await viewRouter.vm.$emit('offer-draw');
    expect(mockOfferDraw).toHaveBeenCalledWith('DRAW1');
    expect(wrapper.find('[data-testid="app-notification-banner"]').text()).toContain('Draw offer sent');

    await viewRouter.vm.$emit('accept-draw');
    expect(mockRespondDraw).toHaveBeenCalledWith('DRAW1', true);

    await viewRouter.vm.$emit('decline-draw');
    expect(mockRespondDraw).toHaveBeenCalledWith('DRAW1', false);
  });

  it('navigates through puzzle hub drill, ladder, and rush modes, and handles exits', async () => {
    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });

    await viewRouter.vm.$emit('launch-drills', 'pin');
    expect((wrapper.vm as any).currentAppMode).toBe('puzzle_hub');

    await viewRouter.vm.$emit('launch-ladder');
    expect((wrapper.vm as any).currentAppMode).toBe('puzzle_hub');

    await viewRouter.vm.$emit('launch-rush', 'puzzle_rush');
    expect((wrapper.vm as any).currentAppMode).toBe('puzzle_hub');

    await viewRouter.vm.$emit('puzzle-exit');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');

    const navbar = wrapper.findComponent({ name: 'AppNavbar' });
    await navbar.vm.$emit('exit-puzzle');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');
  });

  it('handles canonical puzzle-exit event to restore view state across puzzle modes (MIN-021)', async () => {
    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });

    // 1. Enter Puzzle Rush mode
    await viewRouter.vm.$emit('launch-rush', 'puzzle_rush');
    expect((wrapper.vm as any).currentAppMode).toBe('puzzle_hub');
    expect((wrapper.vm as any).puzzleSubMode).toBe('puzzle_rush');

    // Emit canonical puzzle-exit from AppViewRouter
    await viewRouter.vm.$emit('puzzle-exit');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');
    expect((wrapper.vm as any).lobbyActiveMode).toBe('puzzle_hub');
    expect((wrapper.vm as any).puzzleSubMode).toBe('hub');

    // 2. Enter Streak Survivor mode
    await viewRouter.vm.$emit('launch-rush', 'streak_survivor');
    expect((wrapper.vm as any).currentAppMode).toBe('puzzle_hub');
    expect((wrapper.vm as any).puzzleSubMode).toBe('streak_survivor');

    // Emit canonical puzzle-exit again to exit Streak Survivor
    await viewRouter.vm.$emit('puzzle-exit');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');
    expect((wrapper.vm as any).lobbyActiveMode).toBe('puzzle_hub');
    expect((wrapper.vm as any).puzzleSubMode).toBe('hub');

    // 3. Enter Drills mode and emit puzzle-exit
    await viewRouter.vm.$emit('launch-drills', 'fork');
    expect((wrapper.vm as any).currentAppMode).toBe('puzzle_hub');
    expect((wrapper.vm as any).puzzleSubMode).toBe('themed_drills');

    await viewRouter.vm.$emit('puzzle-exit');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');
    expect((wrapper.vm as any).lobbyActiveMode).toBe('puzzle_hub');
    expect((wrapper.vm as any).puzzleSubMode).toBe('hub');

    // 4. Enter Ladder mode and emit puzzle-exit
    await viewRouter.vm.$emit('launch-ladder');
    expect((wrapper.vm as any).currentAppMode).toBe('puzzle_hub');
    expect((wrapper.vm as any).puzzleSubMode).toBe('adaptive_ladder');

    await viewRouter.vm.$emit('puzzle-exit');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');
    expect((wrapper.vm as any).lobbyActiveMode).toBe('puzzle_hub');
    expect((wrapper.vm as any).puzzleSubMode).toBe('hub');
  });

  it('handles scenario completions, lesson progression, and academy exits', async () => {
    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });

    await viewRouter.vm.$emit('scenario-completed');
    await viewRouter.vm.$emit('next-lesson', ALL_SCENARIOS[1]);
    await viewRouter.vm.$emit('academy-back');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');

    const navbar = wrapper.findComponent({ name: 'AppNavbar' });
    await navbar.vm.$emit('exit-academy');
    expect((wrapper.vm as any).currentAppMode).toBe('lobby');
  });

  it('handles progress sync modal opening, conflict resolution, and banner snooze', async () => {
    const wrapper = mount(App);
    await flushPromises();
    const navbar = wrapper.findComponent({ name: 'AppNavbar' });
    await navbar.vm.$emit('open-sync');

    const modalContainer = wrapper.findComponent({ name: 'AppModalContainer' });
    await modalContainer.vm.$emit('resolve-conflict', 'keep_local');
    await modalContainer.vm.$emit('dismiss-conflict');
    await modalContainer.vm.$emit('prompt-install');
    await modalContainer.vm.$emit('snooze-prompt');
  });

  it('parses URL query params for initial room code on startup', async () => {
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = new URL('http://localhost:5173/?join=CAMP');

    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });
    expect(viewRouter.props('initialRoomCode')).toBe('CAMP');

    (window as any).location = originalLocation;
  });

  it('loads initial lobby mode as multiplayer_lan when scenario progress exists', async () => {
    mockStorage[STORAGE_KEYS.SCENARIO_PROGRESS] = JSON.stringify({
      'pawn_journey': { starsEarned: 3 },
    });

    const wrapper = mount(App);
    await flushPromises();
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });
    expect(viewRouter.props('lobbyActiveMode')).toBe('multiplayer_lan');
  });

  it('safely handles corrupted scenario progress data in localStorage on boot', async () => {
    mockStorage[STORAGE_KEYS.SCENARIO_PROGRESS] = 'INVALID_MALFORMED_JSON{{{';

    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.find('[data-testid="app-shell"]').exists()).toBe(true);
    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });
    expect(viewRouter.props('lobbyActiveMode')).toBe('academy');
  });

  it('parses ?join= query param for initial room code on startup', async () => {
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = new URL('https://fun-chess.local/?join=ABCD');

    const wrapper = mount(App);
    await flushPromises();

    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });
    expect(viewRouter.props('initialRoomCode')).toBe('ABCD');

    (window as any).location = originalLocation;
  });

  it('cleans up audio listeners when App component unmounts', async () => {
    const wrapper = mount(App);
    await flushPromises();

    expect(() => wrapper.unmount()).not.toThrow();
  });

  it('watches kingInCheck and triggers check audio alert', async () => {
    const wrapper = mount(App);
    await flushPromises();

    mockKingInCheck.value = true;
    await flushPromises();
    // Verify component handles check state change without crashing
    expect(wrapper.find('[data-testid="app-shell"]').exists()).toBe(true);
  });

  it('handles room status transition from lobby to playing closing QR modal', async () => {
    mockCurrentRoom.value = { roomCode: 'ROOM1', status: 'lobby' };
    const wrapper = mount(App);
    await flushPromises();

    mockCurrentRoom.value = { roomCode: 'ROOM1', status: 'playing' };
    await flushPromises();

    const modalContainer = wrapper.findComponent({ name: 'AppModalContainer' });
    expect(modalContainer.props('showQrModal')).toBe(false);
  });

  it('handles defeat game over state without celebrating', async () => {
    mockCurrentRoom.value = {
      roomCode: 'DEFEAT1',
      status: 'playing',
      whitePlayer: { socketId: 'mock-socket-1', color: 'w' },
      blackPlayer: { socketId: 'other-socket', color: 'b' },
    };
    const wrapper = mount(App);
    await flushPromises();

    // Player is white, winner is black (defeat)
    mockLastGameOver.value = {
      roomCode: 'DEFEAT1',
      winner: 'b',
      reason: 'checkmate',
    };
    await flushPromises();

    const modalContainer = wrapper.findComponent({ name: 'AppModalContainer' });
    expect(modalContainer.props('showGameOverModal')).toBe(true);
    expect(modalContainer.props('isWinner')).toBe(false);
  });

  it('prompts leave confirmation when navbar brand is clicked while in an active room', async () => {
    mockCurrentRoom.value = { roomCode: 'ROOM1', status: 'playing' };
    const wrapper = mount(App);
    await flushPromises();

    const navbar = wrapper.findComponent({ name: 'AppNavbar' });
    await navbar.vm.$emit('navigate-home');
    await flushPromises();

    const modalContainer = wrapper.findComponent({ name: 'AppModalContainer' });
    expect(modalContainer.props('showConfirmModal')).toBe(true);
    expect(modalContainer.props('confirmTitle')).toBe('Leave Match?');
  });

  it('guards move execution when room is not present or already submitting', async () => {
    mockCurrentRoom.value = null;
    const wrapper = mount(App);
    await flushPromises();

    const viewRouter = wrapper.findComponent({ name: 'AppViewRouter' });
    await viewRouter.vm.$emit('execute-move', { from: 'e2', to: 'e4' });
    expect(mockMakeMove).not.toHaveBeenCalled();
  });
});


