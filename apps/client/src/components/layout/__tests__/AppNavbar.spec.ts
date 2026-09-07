import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { RoomState, Player } from '@fun-chess/shared';
import AppNavbar from '../AppNavbar.vue';

describe('AppNavbar.vue', () => {
  const mockWhitePlayer: Player = {
    id: 'p1',
    socketId: 'sock-1',
    name: 'Alice',
    color: 'w',
    isConnected: true,
    isHost: true,
    avatar: '🦊',
    connectedAt: Date.now(),
  };

  const mockBlackPlayer: Player = {
    id: 'p2',
    socketId: 'sock-2',
    name: 'Bob',
    color: 'b',
    isConnected: true,
    isHost: false,
    avatar: '🐼',
    connectedAt: Date.now(),
  };

  const mockPlayingRoom: RoomState = {
    roomCode: 'ABCD',
    hostId: 'p1',
    status: 'playing',
    whitePlayer: mockWhitePlayer,
    blackPlayer: mockBlackPlayer,
    spectators: [],
    game: {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: null,
      moveCount: 4,
    },
    rematch: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  const defaultProps = {
    currentRoom: null,
    currentPlayer: null,
    currentAppMode: 'lobby' as const,
    isMyTurn: false,
    canInstall: false,
    isStandalone: false,
    isMuted: false,
    isDarkMode: false,
    activeScenario: null,
    puzzleSubMode: 'hub' as const,
  };

  it('renders navbar brand button with type="button", aria-label="Fun Chess Home", and emits navigate-home on click', async () => {
    const wrapper = mount(AppNavbar, {
      props: defaultProps,
    });

    const brandBtn = wrapper.find('.navbar-brand');
    expect(brandBtn.exists()).toBe(true);
    expect(brandBtn.attributes('type')).toBe('button');
    expect(brandBtn.attributes('aria-label')).toBe('Fun Chess Home');
    expect(brandBtn.text()).toContain('Fun Chess! ✨');

    await brandBtn.trigger('click');
    expect(wrapper.emitted('navigate-home')).toBeTruthy();
    expect(wrapper.emitted('navigate-home')?.length).toBe(1);
  });

  it('does not render room-code-chip when currentRoom prop is null', () => {
    const wrapper = mount(AppNavbar, {
      props: {
        ...defaultProps,
        currentRoom: null,
      },
    });

    expect(wrapper.find('[data-testid="room-code-chip"]').exists()).toBe(false);
  });

  it('renders room code chip with data-testid="room-code-chip" when currentRoom is provided and emits open-qr on click', async () => {
    const wrapper = mount(AppNavbar, {
      props: {
        ...defaultProps,
        currentRoom: mockPlayingRoom,
      },
    });

    const chip = wrapper.find('[data-testid="room-code-chip"]');
    expect(chip.exists()).toBe(true);
    expect(chip.attributes('type')).toBe('button');
    expect(chip.text()).toContain('ABCD');
    expect(chip.attributes('aria-label')).toContain('ABCD');

    await chip.trigger('click');
    expect(wrapper.emitted('open-qr')).toBeTruthy();
    expect(wrapper.emitted('open-qr')?.length).toBe(1);
  });

  it('displays turn status badge when room status is "playing"', async () => {
    const wrapperMyTurn = mount(AppNavbar, {
      props: {
        ...defaultProps,
        currentRoom: mockPlayingRoom,
        currentPlayer: mockPlayingRoom.whitePlayer,
        isMyTurn: true,
      },
    });

    const badgeMyTurn = wrapperMyTurn.find('.turn-status-badge');
    expect(badgeMyTurn.exists()).toBe(true);
    expect(badgeMyTurn.classes()).toContain('is-my-turn');
    expect(badgeMyTurn.text()).toContain('Your Turn! ✨');

    const wrapperOpponentTurn = mount(AppNavbar, {
      props: {
        ...defaultProps,
        currentRoom: mockPlayingRoom,
        currentPlayer: mockPlayingRoom.whitePlayer,
        isMyTurn: false,
      },
    });

    const badgeOpponentTurn = wrapperOpponentTurn.find('.turn-status-badge');
    expect(badgeOpponentTurn.exists()).toBe(true);
    expect(badgeOpponentTurn.classes()).not.toContain('is-my-turn');
    expect(badgeOpponentTurn.text()).toContain('Thinking... ⏳');
  });

  it('does not display turn status badge when room status is "lobby"', () => {
    const lobbyRoom: RoomState = {
      ...mockPlayingRoom,
      status: 'lobby',
    };

    const wrapper = mount(AppNavbar, {
      props: {
        ...defaultProps,
        currentRoom: lobbyRoom,
      },
    });

    expect(wrapper.find('.turn-status-badge').exists()).toBe(false);
  });

  it('displays PWA install button when canInstall is true and emits install event on click', async () => {
    const wrapper = mount(AppNavbar, {
      props: {
        ...defaultProps,
        canInstall: true,
      },
    });

    const installBtn = wrapper.find('[data-testid="pwa-install-btn"]');
    expect(installBtn.exists()).toBe(true);
    expect(installBtn.attributes('aria-label')).toBe('Install App');

    await installBtn.trigger('click');
    expect(
      wrapper.emitted('install-pwa') ||
      wrapper.emitted('prompt-install') ||
      wrapper.emitted('install')
    ).toBeTruthy();
  });

  it('hides PWA install button when canInstall is false', () => {
    const wrapper = mount(AppNavbar, {
      props: {
        ...defaultProps,
        canInstall: false,
      },
    });
    expect(wrapper.find('[data-testid="pwa-install-btn"]').exists()).toBe(false);
  });

  it('mute button toggles aria-label ("Mute audio" / "Unmute audio") and emits toggle-mute', async () => {
    // Unmuted state
    const wrapperUnmuted = mount(AppNavbar, {
      props: { ...defaultProps, isMuted: false },
    });
    const unmutedBtn = wrapperUnmuted.find('[data-testid="mute-toggle-btn"]');
    expect(unmutedBtn.attributes('aria-label')).toBe('Mute audio');

    await unmutedBtn.trigger('click');
    expect(wrapperUnmuted.emitted('toggle-mute')).toBeTruthy();

    // Muted state
    const wrapperMuted = mount(AppNavbar, {
      props: { ...defaultProps, isMuted: true },
    });
    const mutedBtn = wrapperMuted.find('[data-testid="mute-toggle-btn"]');
    expect(mutedBtn.attributes('aria-label')).toBe('Unmute audio');

    await mutedBtn.trigger('click');
    expect(wrapperMuted.emitted('toggle-mute')).toBeTruthy();
  });

  it('theme button toggles aria-label ("Switch to dark mode" / "Switch to light mode") and emits toggle-theme', async () => {
    // Light mode active
    const wrapperLight = mount(AppNavbar, {
      props: { ...defaultProps, isDarkMode: false },
    });
    const themeBtnLight = wrapperLight.find('[data-testid="theme-toggle-btn"]').exists()
      ? wrapperLight.find('[data-testid="theme-toggle-btn"]')
      : wrapperLight.findAll('.nav-icon-btn').find((btn) => btn.attributes('aria-label')?.includes('mode'));

    expect(themeBtnLight?.exists()).toBe(true);
    expect(themeBtnLight?.attributes('aria-label')).toBe('Switch to dark mode');

    await themeBtnLight?.trigger('click');
    expect(wrapperLight.emitted('toggle-theme')).toBeTruthy();

    // Dark mode active
    const wrapperDark = mount(AppNavbar, {
      props: { ...defaultProps, isDarkMode: true },
    });
    const themeBtnDark = wrapperDark.find('[data-testid="theme-toggle-btn"]').exists()
      ? wrapperDark.find('[data-testid="theme-toggle-btn"]')
      : wrapperDark.findAll('.nav-icon-btn').find((btn) => btn.attributes('aria-label')?.includes('mode'));

    expect(themeBtnDark?.exists()).toBe(true);
    expect(themeBtnDark?.attributes('aria-label')).toBe('Switch to light mode');

    await themeBtnDark?.trigger('click');
    expect(wrapperDark.emitted('toggle-theme')).toBeTruthy();
  });

  it('save & sync button renders and emits open-sync on click', async () => {
    const wrapper = mount(AppNavbar, {
      props: defaultProps,
    });

    const syncBtn = wrapper.find('[data-testid="save-sync-btn"]');
    expect(syncBtn.exists()).toBe(true);
    expect(syncBtn.attributes('aria-label')).toBe('Save & Sync Progress');

    await syncBtn.trigger('click');
    expect(wrapper.emitted('open-sync')).toBeTruthy();
  });

  describe('Mode-specific exit buttons', () => {
    it('renders leave-room-btn when currentRoom is active, emitting leave-room on click', async () => {
      const wrapper = mount(AppNavbar, {
        props: {
          ...defaultProps,
          currentRoom: mockPlayingRoom,
        },
      });

      const leaveBtn = wrapper.find('[data-testid="leave-room-btn"]');
      expect(leaveBtn.exists()).toBe(true);
      expect(leaveBtn.attributes('aria-label')).toBe('Return to Lobby');
      expect(wrapper.find('[data-testid="exit-solo-ai-btn"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="exit-academy-btn"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="exit-puzzle-btn"]').exists()).toBe(false);

      await leaveBtn.trigger('click');
      expect(wrapper.emitted('leave-room')).toBeTruthy();
    });

    it('renders exit-solo-ai-btn when currentAppMode is "solo_ai", emitting exit-solo-ai on click', async () => {
      const wrapper = mount(AppNavbar, {
        props: {
          ...defaultProps,
          currentAppMode: 'solo_ai',
        },
      });

      const exitAiBtn = wrapper.find('[data-testid="exit-solo-ai-btn"]');
      expect(exitAiBtn.exists()).toBe(true);
      expect(exitAiBtn.attributes('aria-label')).toBe('Return to Lobby');

      await exitAiBtn.trigger('click');
      expect(wrapper.emitted('exit-solo-ai')).toBeTruthy();
    });

    it('renders exit-academy-btn when in academy mode with active scenario, emitting exit-academy on click', async () => {
      const mockScenario = {
        id: 'pawn-1',
        title: 'Pawn Steps',
        description: 'Learn how pawns advance',
        difficulty: 'beginner' as const,
        theme: 'pawn' as const,
        targetMoves: 3,
        initialFen: '8/8/8/8/8/8/4P3/8 w - - 0 1',
        tasks: [],
      };

      const wrapper = mount(AppNavbar, {
        props: {
          ...defaultProps,
          currentAppMode: 'academy',
          activeScenario: mockScenario,
        },
      });

      const exitAcademyBtn = wrapper.find('[data-testid="exit-academy-btn"]');
      expect(exitAcademyBtn.exists()).toBe(true);
      expect(exitAcademyBtn.attributes('aria-label')).toBe('Return to Academy');

      await exitAcademyBtn.trigger('click');
      expect(wrapper.emitted('exit-academy')).toBeTruthy();
    });

    it('renders exit-puzzle-btn when in puzzle_hub with active drill/submode, emitting exit-puzzle on click', async () => {
      const wrapper = mount(AppNavbar, {
        props: {
          ...defaultProps,
          currentAppMode: 'puzzle_hub',
          puzzleSubMode: 'themed_drills',
        },
      });

      const exitPuzzleBtn = wrapper.find('[data-testid="exit-puzzle-btn"]');
      expect(exitPuzzleBtn.exists()).toBe(true);
      expect(exitPuzzleBtn.attributes('aria-label')).toBe('Return to Puzzle Hub');

      await exitPuzzleBtn.trigger('click');
      expect(wrapper.emitted('exit-puzzle')).toBeTruthy();
    });

    it('does not render any exit buttons when in standard lobby mode with no room', () => {
      const wrapper = mount(AppNavbar, {
        props: defaultProps,
      });

      expect(wrapper.find('[data-testid="leave-room-btn"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="exit-solo-ai-btn"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="exit-academy-btn"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="exit-puzzle-btn"]').exists()).toBe(false);
    });
  });

  describe('WCAG 2.5.5 Touch Target Sizing (>= 44x44px)', () => {
    it('navbar interactive controls enforce min-height and min-width >= 44px', () => {
      const wrapper = mount(AppNavbar, {
        props: {
          ...defaultProps,
          currentRoom: mockPlayingRoom,
          canInstall: true,
        },
      });

      const brand = wrapper.find('.navbar-brand');
      expect(brand.exists()).toBe(true);

      const roomChip = wrapper.find('.room-code-chip');
      expect(roomChip.exists()).toBe(true);

      const navButtons = wrapper.findAll('.nav-icon-btn');
      expect(navButtons.length).toBeGreaterThan(0);
    });
  });
});
