import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { RoomState, Player, SoloAiLaunchConfig, ChessScenario } from '@fun-chess/shared';
import AppViewRouter from '../AppViewRouter.vue';
import AppViewRouterRoot from '@/components/AppViewRouter.vue';

describe('AppViewRouter.vue', () => {
  const mockWhitePlayer: Player = {
    id: 'p1',
    socketId: 'sock-1',
    name: 'White',
    color: 'w',
    isConnected: true,
    isHost: true,
    avatar: '🦁',
    connectedAt: Date.now(),
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockBlackPlayer: Player = {
    id: 'p2',
    socketId: 'sock-2',
    name: 'Black',
    color: 'b',
    isConnected: true,
    isHost: false,
    avatar: '🐼',
    connectedAt: Date.now(),
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockRoom: RoomState = {
    roomCode: 'VIEW',
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
      moveCount: 0,
    },
    rematch: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  const mockSoloAiConfig: SoloAiLaunchConfig = {
    mascotId: 'peanut',
    playerColor: 'w',
    playerName: 'Champion',
    playerAvatar: '🦁',
  };

  const mockScenario: ChessScenario = {
    id: 'intro-1',
    title: 'Intro to Chess',
    subtitle: 'Learn the basics of chess pieces',
    category: 'fundamentals',
    difficulty: 'beginner',
    targetAgeGroup: '7-10',
    icon: '♟️',
    description: 'Learn the basics',
    estimatedMinutes: 5,
    steps: [],
  };

  const defaultProps = {
    currentAppMode: 'lobby' as const,
    lobbyActiveMode: 'multiplayer_lan' as const,
    currentRoom: null,
    soloAiConfig: null,
    activeScenario: null,
    puzzleSubMode: 'hub' as const,
    puzzleDrillTheme: 'fork' as const,
    initialRoomCode: '',
    lanInfo: null,
    isActionLoading: false,
  };

  const globalConfig = {
    stubs: {
      LobbyView: true,
      SoloAiArena: true,
      ScenarioArena: true,
      PuzzleArena: true,
      PuzzleRushArena: true,
      MultiplayerArena: {
        name: 'MultiplayerArena',
        props: ['currentRoom', 'currentPlayer', 'isConnected'],
        template: '<div class="multiplayer-arena-stub"><slot /></div>',
      },
    },
  };

  it('exports default AppViewRouter component at @/components/AppViewRouter.vue', () => {
    expect(AppViewRouterRoot).toBeDefined();
    expect(AppViewRouterRoot).toBe(AppViewRouter);
  });

  it('renders LobbyView by default when currentAppMode is "lobby" and no room is active', () => {
    const wrapper = mount(AppViewRouter, {
      props: defaultProps,
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'LobbyView' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'SoloAiArena' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'ScenarioArena' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'PuzzleArena' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'PuzzleRushArena' }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'MultiplayerArena' }).exists()).toBe(false);
  });

  it('forwards LobbyView user events to parent', async () => {
    const wrapper = mount(AppViewRouter, {
      props: defaultProps,
      global: globalConfig,
    });

    const lobby = wrapper.findComponent({ name: 'LobbyView' });
    expect(lobby.exists()).toBe(true);

    // Host game event
    await lobby.vm.$emit('host', { playerName: 'HostHero', preferredColor: 'w' });
    expect(wrapper.emitted('host')).toBeTruthy();

    // Join game event
    await lobby.vm.$emit('join', { roomCode: 'ABCD', playerName: 'Guest' });
    expect(wrapper.emitted('join')).toBeTruthy();

    // Start Solo AI event
    await lobby.vm.$emit('start-solo-ai', mockSoloAiConfig);
    expect(wrapper.emitted('start-solo-ai') || wrapper.emitted('startSoloAi')).toBeTruthy();

    // Select Scenario event
    await lobby.vm.$emit('select-scenario', mockScenario);
    expect(wrapper.emitted('select-scenario') || wrapper.emitted('selectScenario')).toBeTruthy();

    // Launch Drills event
    await lobby.vm.$emit('launch-drills', 'fork');
    expect(wrapper.emitted('launch-drills') || wrapper.emitted('launchDrills')).toBeTruthy();

    // Launch Rush event
    await lobby.vm.$emit('launch-rush', 'puzzle_rush');
    expect(wrapper.emitted('launch-rush') || wrapper.emitted('launchRush')).toBeTruthy();

    // Open Sync event
    await lobby.vm.$emit('open-sync');
    expect(wrapper.emitted('open-sync') || wrapper.emitted('openSync')).toBeTruthy();
  });

  it('switches to SoloAiArena when mode is "solo_ai" and soloAiConfig is provided', async () => {
    const wrapper = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'solo_ai',
        soloAiConfig: mockSoloAiConfig,
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'SoloAiArena' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LobbyView' }).exists()).toBe(false);

    const soloArena = wrapper.findComponent({ name: 'SoloAiArena' });
    await soloArena.vm.$emit('exit');
    expect(wrapper.emitted('solo-ai-exit')).toBeTruthy();

    await soloArena.vm.$emit('change-opponent');
    expect(wrapper.emitted('solo-ai-change-opponent')).toBeTruthy();
  });

  it('switches to ScenarioArena when mode is "academy" and activeScenario is provided', async () => {
    const wrapper = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'academy',
        activeScenario: mockScenario,
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'ScenarioArena' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LobbyView' }).exists()).toBe(false);

    const academy = wrapper.findComponent({ name: 'ScenarioArena' });
    await academy.vm.$emit('back');
    expect(wrapper.emitted('academy-back')).toBeTruthy();

    await academy.vm.$emit('next-lesson', mockScenario);
    expect(wrapper.emitted('next-lesson')).toBeTruthy();

    await academy.vm.$emit('completed', 3);
    expect(wrapper.emitted('scenario-completed')).toBeTruthy();
  });

  it('switches to PuzzleArena when mode is "puzzle_hub" and sub-mode is "themed_drills" or "adaptive_ladder"', async () => {
    // Themed drills
    const wrapperDrills = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'puzzle_hub',
        puzzleSubMode: 'themed_drills',
        puzzleDrillTheme: 'fork',
      },
      global: globalConfig,
    });

    expect(wrapperDrills.findComponent({ name: 'PuzzleArena' }).exists()).toBe(true);
    expect(wrapperDrills.findComponent({ name: 'LobbyView' }).exists()).toBe(false);

    const puzzleArena = wrapperDrills.findComponent({ name: 'PuzzleArena' });
    await puzzleArena.vm.$emit('back');
    expect(wrapperDrills.emitted('puzzle-exit')).toBeTruthy();

    // Adaptive ladder
    const wrapperLadder = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'puzzle_hub',
        puzzleSubMode: 'adaptive_ladder',
      },
      global: globalConfig,
    });

    expect(wrapperLadder.findComponent({ name: 'PuzzleArena' }).exists()).toBe(true);
  });

  it('switches to PuzzleRushArena when mode is "puzzle_hub" and sub-mode is "puzzle_rush" or "streak_survivor"', async () => {
    // Puzzle rush
    const wrapperRush = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'puzzle_hub',
        puzzleSubMode: 'puzzle_rush',
      },
      global: globalConfig,
    });

    expect(wrapperRush.findComponent({ name: 'PuzzleRushArena' }).exists()).toBe(true);
    expect(wrapperRush.findComponent({ name: 'LobbyView' }).exists()).toBe(false);

    const rushArena = wrapperRush.findComponent({ name: 'PuzzleRushArena' });
    await rushArena.vm.$emit('exit');
    expect(wrapperRush.emitted('puzzle-exit')).toBeTruthy();

    // Streak survivor
    const wrapperStreak = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'puzzle_hub',
        puzzleSubMode: 'streak_survivor',
      },
      global: globalConfig,
    });

    expect(wrapperStreak.findComponent({ name: 'PuzzleRushArena' }).exists()).toBe(true);
  });

  it('switches to PuzzleArena when mode is "puzzle_drills" without falling through to LobbyView', async () => {
    const wrapper = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'puzzle_drills',
        puzzleDrillTheme: 'pin',
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'PuzzleArena' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LobbyView' }).exists()).toBe(false);

    const puzzleArena = wrapper.findComponent({ name: 'PuzzleArena' });
    expect(puzzleArena.props('mode')).toBe('themed_drills');
    expect(puzzleArena.props('initialTheme')).toBe('pin');

    await puzzleArena.vm.$emit('back');
    expect(wrapper.emitted('puzzle-exit')).toBeTruthy();

    await puzzleArena.vm.$emit('completed', 3);
    expect(wrapper.emitted('puzzle-completed') || wrapper.emitted('completed')).toBeTruthy();
  });

  it('switches to PuzzleArena when mode is "puzzle_ladder" without falling through to LobbyView', async () => {
    const wrapper = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'puzzle_ladder',
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'PuzzleArena' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LobbyView' }).exists()).toBe(false);

    const puzzleArena = wrapper.findComponent({ name: 'PuzzleArena' });
    expect(puzzleArena.props('mode')).toBe('adaptive_ladder');

    await puzzleArena.vm.$emit('exit');
    expect(wrapper.emitted('puzzle-exit')).toBeTruthy();
  });

  it('switches to PuzzleRushArena when mode is "puzzle_rush" without falling through to LobbyView', async () => {
    const wrapper = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentAppMode: 'puzzle_rush',
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'PuzzleRushArena' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LobbyView' }).exists()).toBe(false);

    const rushArena = wrapper.findComponent({ name: 'PuzzleRushArena' });
    await rushArena.vm.$emit('exit');
    expect(wrapper.emitted('puzzle-exit')).toBeTruthy();
  });

  it('switches to MultiplayerArena when currentRoom is present and status is "playing" or "paused_disconnect"', async () => {
    const wrapper = mount(AppViewRouter, {
      props: {
        ...defaultProps,
        currentRoom: mockRoom,
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'MultiplayerArena' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LobbyView' }).exists()).toBe(false);

    const arena = wrapper.findComponent({ name: 'MultiplayerArena' });
    await arena.vm.$emit('select-square', 'e2');
    expect(wrapper.emitted('select-square') || wrapper.emitted('selectSquare')).toBeTruthy();

    await arena.vm.$emit('execute-move', { from: 'e2', to: 'e4' });
    expect(wrapper.emitted('execute-move') || wrapper.emitted('executeMove')).toBeTruthy();

    await arena.vm.$emit('promotion-required', { from: 'e7', to: 'e8' });
    expect(wrapper.emitted('promotion-required')).toBeTruthy();

    await arena.vm.$emit('offer-draw');
    expect(wrapper.emitted('offer-draw') || wrapper.emitted('offerDraw')).toBeTruthy();

    await arena.vm.$emit('accept-draw');
    expect(wrapper.emitted('accept-draw')).toBeTruthy();

    await arena.vm.$emit('decline-draw');
    expect(wrapper.emitted('decline-draw')).toBeTruthy();

    await arena.vm.$emit('resign');
    expect(wrapper.emitted('resign')).toBeTruthy();

    await arena.vm.$emit('flip-board');
    expect(wrapper.emitted('flip-board')).toBeTruthy();
  });

  it('forwards create-room, join-room, launch-ladder, and open-sync events from LobbyView', async () => {
    const wrapper = mount(AppViewRouter, {
      props: defaultProps,
      global: globalConfig,
    });

    const lobby = wrapper.findComponent({ name: 'LobbyView' });
    expect(lobby.exists()).toBe(true);

    await lobby.vm.$emit('create-room', { playerName: 'Alice', avatar: '🦁', preferredColor: 'w' });
    expect(wrapper.emitted('create-room')).toBeTruthy();

    await lobby.vm.$emit('join-room', { roomCode: 'TEST', playerName: 'Bob', avatar: '🐼' });
    expect(wrapper.emitted('join-room')).toBeTruthy();

    await lobby.vm.$emit('launch-ladder');
    expect(wrapper.emitted('launch-ladder')).toBeTruthy();

    await lobby.vm.$emit('open-sync');
    expect(wrapper.emitted('open-sync')).toBeTruthy();
  });
});
