import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import GameHud from '../GameHud.vue';
import type { GameState, Player } from '@fun-chess/shared';

describe('GameHud.vue', () => {
  const mockWhitePlayer: Player = {
    id: 'player-white',
    socketId: 'socket-white',
    name: 'Alice',
    color: 'w',
    isConnected: true,
    isHost: true,
    connectedAt: Date.now(),
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockBlackPlayer: Player = {
    id: 'player-black',
    socketId: 'socket-black',
    name: 'Bob',
    color: 'b',
    isConnected: true,
    isHost: false,
    connectedAt: Date.now(),
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockGameState: GameState = {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isDraw: false,
    isThreefoldRepetition: false,
    isInsufficientMaterial: false,
    isFiftyMoveRule: false,
    moveHistory: [],
    capturedWhite: ['p', 'n'],
    capturedBlack: ['q'],
    materialAdvantage: {
      white: 5,
      black: 0,
    },
    lastMove: null,
    moveCount: 0,
  };

  it('renders opponent section, player section, and captured trays', () => {
    const wrapper = mount(GameHud, {
      props: {
        whitePlayer: mockWhitePlayer,
        blackPlayer: mockBlackPlayer,
        currentTurn: 'w',
        selfPlayerId: 'player-white',
        gameState: mockGameState,
        isMuted: false,
      },
    });

    expect(wrapper.find('[data-testid="game-hud"]').exists()).toBe(true);
    expect(wrapper.find('.opponent-section').exists()).toBe(true);
    expect(wrapper.find('.player-section').exists()).toBe(true);
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.text()).toContain('Bob');
  });

  it('provides explicit accessible labels and verb-first copy for toolbar action buttons', () => {
    const wrapper = mount(GameHud, {
      props: {
        whitePlayer: mockWhitePlayer,
        blackPlayer: mockBlackPlayer,
        currentTurn: 'w',
        selfPlayerId: 'player-white',
        gameState: mockGameState,
        isMuted: false,
      },
    });

    // Sound toggle button
    const soundBtn = wrapper.find('[data-testid="toggle-sound-btn"]');
    expect(soundBtn.exists()).toBe(true);
    expect(soundBtn.attributes('aria-label')).toBe('Mute audio');
    expect(soundBtn.text()).toContain('Mute');

    // Flip board button
    const flipBtn = wrapper.find('[data-testid="flip-board-btn"]');
    expect(flipBtn.exists()).toBe(true);
    expect(flipBtn.attributes('aria-label')).toBe('Flip board');
    expect(flipBtn.text()).toContain('Flip');

    // Offer draw button (verb-first)
    const drawBtn = wrapper.find('[data-testid="offer-draw-btn"]');
    expect(drawBtn.exists()).toBe(true);
    expect(drawBtn.attributes('aria-label')).toBe('Offer draw');
    expect(drawBtn.text()).toContain('Offer Draw');

    // Resign button
    const resignBtn = wrapper.find('[data-testid="resign-btn"]');
    expect(resignBtn.exists()).toBe(true);
    expect(resignBtn.attributes('aria-label')).toBe('Resign');
    expect(resignBtn.text()).toContain('Resign');
  });

  it('updates sound toggle aria-label and text when isMuted is true', () => {
    const wrapper = mount(GameHud, {
      props: {
        whitePlayer: mockWhitePlayer,
        blackPlayer: mockBlackPlayer,
        currentTurn: 'w',
        selfPlayerId: 'player-white',
        gameState: mockGameState,
        isMuted: true,
      },
    });

    const soundBtn = wrapper.find('[data-testid="toggle-sound-btn"]');
    expect(soundBtn.attributes('aria-label')).toBe('Unmute audio');
    expect(soundBtn.text()).toContain('Unmute');
  });

  it('emits toolbar action events when buttons are clicked', async () => {
    const wrapper = mount(GameHud, {
      props: {
        whitePlayer: mockWhitePlayer,
        blackPlayer: mockBlackPlayer,
        currentTurn: 'w',
        selfPlayerId: 'player-white',
        gameState: mockGameState,
        isMuted: false,
      },
    });

    await wrapper.find('[data-testid="toggle-sound-btn"]').trigger('click');
    expect(wrapper.emitted('toggle-sound')).toHaveLength(1);

    await wrapper.find('[data-testid="flip-board-btn"]').trigger('click');
    expect(wrapper.emitted('flip-board')).toHaveLength(1);

    await wrapper.find('[data-testid="offer-draw-btn"]').trigger('click');
    expect(wrapper.emitted('offer-draw')).toHaveLength(1);

    await wrapper.find('[data-testid="resign-btn"]').trigger('click');
    expect(wrapper.emitted('resign')).toHaveLength(1);
  });

  it('renders .hud-toolbar wrapper with all action buttons for responsive wrap', () => {
    const wrapper = mount(GameHud, {
      props: {
        whitePlayer: mockWhitePlayer,
        blackPlayer: mockBlackPlayer,
        currentTurn: 'w',
        selfPlayerId: 'player-white',
        gameState: mockGameState,
        isMuted: false,
      },
    });

    const toolbar = wrapper.find('.hud-toolbar');
    expect(toolbar.exists()).toBe(true);
    expect(toolbar.findAll('button')).toHaveLength(4);
  });
});
