import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { RoomState, Player } from '@fun-chess/shared';
import MultiplayerArena from '../MultiplayerArena.vue';

describe('MultiplayerArena.vue', () => {
  const mockWhitePlayer: Player = {
    id: 'p1',
    socketId: 'sock-1',
    name: 'Player One',
    color: 'w',
    isConnected: true,
    isHost: true,
    avatar: '🦁',
    connectedAt: Date.now(),
  };

  const mockBlackPlayer: Player = {
    id: 'p2',
    socketId: 'sock-2',
    name: 'Player Two',
    color: 'b',
    isConnected: true,
    isHost: false,
    avatar: '🦊',
    connectedAt: Date.now(),
  };

  const mockRoom: RoomState = {
    roomCode: 'PLAY',
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

  const defaultProps = {
    currentRoom: mockRoom,
    currentPlayer: mockWhitePlayer,
    opponentPlayer: mockBlackPlayer,
    myColor: 'w' as const,
    isMyTurn: true,
    isConnected: true,
    isHost: true,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w' as const,
    orientation: 'w' as const,
    selectedSquare: null,
    legalMoves: [],
    lastMove: null,
    kingInCheckSquare: null,
    capturedWhite: [],
    capturedBlack: [],
    materialAdvantage: { white: 0, black: 0 },
    drawOfferedBy: null,
    moveHistory: [],
    myPlayerAvatar: '🦁',
  };

  const globalConfig = {
    stubs: {
      ChessBoard: true,
      PlayerBadge: {
        name: 'PlayerBadge',
        props: ['playerName', 'color', 'isCurrentTurn', 'isConnected', 'isHost', 'isSelf', 'avatar'],
        template: '<div class="player-badge-stub"><slot /></div>',
      },
      CapturedTray: true,
      MoveHistoryList: true,
    },
  };

  it('renders .game-arena-container with relative layout class and structure', () => {
    const wrapper = mount(MultiplayerArena, {
      props: defaultProps,
      global: globalConfig,
    });

    const container = wrapper.find('.game-arena-container');
    expect(container.exists()).toBe(true);
  });

  it('renders disconnect-warning-banner with role="alert" when room status is "paused_disconnect"', () => {
    const pausedRoom: RoomState = {
      ...mockRoom,
      status: 'paused_disconnect',
    };

    const wrapper = mount(MultiplayerArena, {
      props: {
        ...defaultProps,
        currentRoom: pausedRoom,
      },
      global: globalConfig,
    });

    const banner = wrapper.find('.disconnect-warning-banner');
    expect(banner.exists()).toBe(true);
    expect(banner.attributes('role')).toBe('alert');
    expect(banner.text()).toContain('disconnected');
  });

  it('does not render disconnect-warning-banner when room status is "playing"', () => {
    const wrapper = mount(MultiplayerArena, {
      props: defaultProps,
      global: globalConfig,
    });

    expect(wrapper.find('.disconnect-warning-banner').exists()).toBe(false);
  });

  it('renders draw-offer-banner with Accept and Decline buttons when drawOfferedBy is set, emitting events on click', async () => {
    const wrapper = mount(MultiplayerArena, {
      props: {
        ...defaultProps,
        drawOfferedBy: {
          fromPlayerId: 'p2',
          fromPlayerName: 'Player Two',
        },
      },
      global: globalConfig,
    });

    const banner = wrapper.find('.draw-offer-banner');
    expect(banner.exists()).toBe(true);
    expect(banner.attributes('role')).toBe('alert');
    expect(banner.text()).toContain('Player Two offered a peaceful draw!');

    // Accept button
    const acceptBtn = banner.findAll('button').find((b) => b.text().toLowerCase().includes('accept'));
    expect(acceptBtn?.exists()).toBe(true);
    await acceptBtn?.trigger('click');
    expect(wrapper.emitted('accept-draw') || wrapper.emitted('acceptDraw')).toBeTruthy();

    // Decline button
    const declineBtn = banner.findAll('button').find((b) => b.text().toLowerCase().includes('decline'));
    expect(declineBtn?.exists()).toBe(true);
    await declineBtn?.trigger('click');
    expect(wrapper.emitted('decline-draw') || wrapper.emitted('declineDraw')).toBeTruthy();
  });

  it('does not render draw-offer-banner when drawOfferedBy is null', () => {
    const wrapper = mount(MultiplayerArena, {
      props: {
        ...defaultProps,
        drawOfferedBy: null,
      },
      global: globalConfig,
    });

    expect(wrapper.find('.draw-offer-banner').exists()).toBe(false);
  });

  it('renders arena turn indicator with accessible status and proper is-my-turn class', () => {
    // My turn
    const wrapperMyTurn = mount(MultiplayerArena, {
      props: {
        ...defaultProps,
        isMyTurn: true,
      },
      global: globalConfig,
    });

    const indicator = wrapperMyTurn.find('.arena-turn-indicator');
    expect(indicator.exists()).toBe(true);
    expect(indicator.attributes('role')).toBe('status');
    expect(indicator.classes()).toContain('is-my-turn');
    expect(indicator.text()).toContain('Your Turn');

    // Opponent turn
    const wrapperOpponentTurn = mount(MultiplayerArena, {
      props: {
        ...defaultProps,
        isMyTurn: false,
      },
      global: globalConfig,
    });

    const indicatorOpponent = wrapperOpponentTurn.find('.arena-turn-indicator');
    expect(indicatorOpponent.exists()).toBe(true);
    expect(indicatorOpponent.classes()).not.toContain('is-my-turn');
    expect(indicatorOpponent.text()).toContain('Waiting for');
  });

  it('renders top opponent and bottom self PlayerBadge and CapturedTray', () => {
    const wrapper = mount(MultiplayerArena, {
      props: defaultProps,
      global: globalConfig,
    });

    const topHud = wrapper.find('.player-hud-row.top-hud');
    expect(topHud.exists()).toBe(true);
    expect(topHud.findComponent({ name: 'PlayerBadge' }).exists()).toBe(true);
    expect(topHud.findComponent({ name: 'CapturedTray' }).exists()).toBe(true);

    const bottomHud = wrapper.find('.player-hud-row.bottom-hud');
    expect(bottomHud.exists()).toBe(true);
    expect(bottomHud.findComponent({ name: 'PlayerBadge' }).exists()).toBe(true);
    expect(bottomHud.findComponent({ name: 'CapturedTray' }).exists()).toBe(true);
  });

  it('renders ChessBoard inside .chessboard-wrapper and forwards board events', async () => {
    const wrapper = mount(MultiplayerArena, {
      props: defaultProps,
      global: globalConfig,
    });

    expect(wrapper.find('.chessboard-wrapper').exists()).toBe(true);
    const chessBoard = wrapper.findComponent({ name: 'ChessBoard' });
    expect(chessBoard.exists()).toBe(true);

    // Forward select event
    await chessBoard.vm.$emit('select', 'e2');
    expect(wrapper.emitted('select-square') || wrapper.emitted('selectSquare') || wrapper.emitted('select')).toBeTruthy();

    // Forward move event
    const movePayload = { from: 'e2', to: 'e4' };
    await chessBoard.vm.$emit('move', movePayload);
    expect(wrapper.emitted('execute-move') || wrapper.emitted('executeMove') || wrapper.emitted('move')).toBeTruthy();

    // Forward promotion-required event
    await chessBoard.vm.$emit('promotion-required', { from: 'e7', to: 'e8' });
    expect(wrapper.emitted('promotion-required') || wrapper.emitted('promotionRequired')).toBeTruthy();
  });

  it('renders in-game toolbar and handles flip-board, offer-draw, resign, and history actions', async () => {
    const wrapper = mount(MultiplayerArena, {
      props: defaultProps,
      global: globalConfig,
    });

    const toolbar = wrapper.find('.in-game-toolbar');
    expect(toolbar.exists()).toBe(true);

    // Flip board
    const flipBtn = wrapper.find('[data-testid="flip-board-action"]');
    expect(flipBtn.exists()).toBe(true);
    await flipBtn.trigger('click');
    expect(wrapper.emitted('flip-board') || wrapper.emitted('flipBoard')).toBeTruthy();

    // Offer draw
    const offerDrawBtn = wrapper.find('[data-testid="offer-draw-action"]');
    expect(offerDrawBtn.exists()).toBe(true);
    expect(offerDrawBtn.attributes('disabled')).toBeUndefined();
    await offerDrawBtn.trigger('click');
    expect(wrapper.emitted('offer-draw') || wrapper.emitted('offerDraw')).toBeTruthy();

    // Resign (with .action-btn--subdued-danger class)
    const resignBtn = wrapper.find('[data-testid="resign-action"]');
    expect(resignBtn.exists()).toBe(true);
    expect(resignBtn.classes()).toContain('action-btn--subdued-danger');
    expect(resignBtn.attributes('disabled')).toBeUndefined();
    await resignBtn.trigger('click');
    expect(wrapper.emitted('resign')).toBeTruthy();

    // Toggle history
    const historyBtn = wrapper.find('[data-testid="toggle-history-action"]');
    expect(historyBtn.exists()).toBe(true);
    expect(wrapper.find('.history-card-wrapper').exists()).toBe(false);

    await historyBtn.trigger('click');
    expect(wrapper.find('.history-card-wrapper').exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'MoveHistoryList' }).exists()).toBe(true);
  });

  it('disables draw and resign buttons when room status is not "playing"', () => {
    const pausedRoom: RoomState = {
      ...mockRoom,
      status: 'paused_disconnect',
    };

    const wrapper = mount(MultiplayerArena, {
      props: {
        ...defaultProps,
        currentRoom: pausedRoom,
      },
      global: globalConfig,
    });

    const offerDrawBtn = wrapper.find('[data-testid="offer-draw-action"]');
    expect(offerDrawBtn.attributes('disabled')).toBeDefined();

    const resignBtn = wrapper.find('[data-testid="resign-action"]');
    expect(resignBtn.attributes('disabled')).toBeDefined();
  });

  describe('UX-MAJ-01 & UX-MAJ-02: Banner in-flow layout and text wrapping', () => {
    it('renders disconnect-warning-banner in-flow before top-hud to push down opponent HUD without overlapping', () => {
      const pausedRoom: RoomState = {
        ...mockRoom,
        status: 'paused_disconnect',
      };

      const wrapper = mount(MultiplayerArena, {
        props: {
          ...defaultProps,
          currentRoom: pausedRoom,
        },
        global: globalConfig,
      });

      const container = wrapper.find('.game-arena-container');
      const children = container.element.children;
      const bannerIndex = Array.from(children).findIndex((el) => el.classList.contains('disconnect-warning-banner'));
      const topHudIndex = Array.from(children).findIndex((el) => el.classList.contains('top-hud'));

      expect(bannerIndex).toBeGreaterThanOrEqual(0);
      expect(topHudIndex).toBeGreaterThan(bannerIndex);
    });

    it('renders draw-offer-banner in-flow before top-hud to push down opponent HUD without overlapping', () => {
      const wrapper = mount(MultiplayerArena, {
        props: {
          ...defaultProps,
          drawOfferedBy: {
            fromPlayerId: 'p2',
            fromPlayerName: 'Player Two',
          },
        },
        global: globalConfig,
      });

      const container = wrapper.find('.game-arena-container');
      const children = container.element.children;
      const bannerIndex = Array.from(children).findIndex((el) => el.classList.contains('draw-offer-banner'));
      const topHudIndex = Array.from(children).findIndex((el) => el.classList.contains('top-hud'));

      expect(bannerIndex).toBeGreaterThanOrEqual(0);
      expect(topHudIndex).toBeGreaterThan(bannerIndex);
    });

    it('verifies MultiplayerArena.vue styles enforce responsive text wrapping and remove absolute positioning', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const sfcPath = path.resolve(__dirname, '../../../features/multiplayer/MultiplayerArena.vue');
      const sfcContent = fs.readFileSync(sfcPath, 'utf-8');

      // UX-MAJ-01: Disconnect warning banner text wrapping
      expect(sfcContent).toMatch(/\.disconnect-warning-banner\s*\{[^}]*text-wrap:\s*balance;/);
      expect(sfcContent).toMatch(/\.disconnect-warning-banner\s*\{[^}]*word-break:\s*break-word;/);
      expect(sfcContent).toMatch(/\.disconnect-warning-banner\s*\{[^}]*line-height:\s*1\.4;/);
      expect(sfcContent).toMatch(/\.disconnect-warning-banner\s*\{[^}]*width:\s*100%;/);
      expect(sfcContent).toMatch(/\.disconnect-warning-banner\s*\{[^}]*box-sizing:\s*border-box;/);

      // UX-MAJ-02: Ensure position: absolute is removed from both banners in MultiplayerArena.vue
      expect(sfcContent).not.toMatch(/\.disconnect-warning-banner\s*\{[^}]*position:\s*absolute;/);
      expect(sfcContent).not.toMatch(/\.draw-offer-banner\s*\{[^}]*position:\s*absolute;/);
      expect(sfcContent).toMatch(/\.draw-offer-banner\s*\{[^}]*width:\s*100%;/);
    });
  });
});
