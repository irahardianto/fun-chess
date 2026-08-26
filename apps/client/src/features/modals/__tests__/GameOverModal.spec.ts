import { describe, it, expect, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import GameOverModal from '../GameOverModal.vue';
import type { GameOverPayload } from '@fun-chess/shared';

describe('GameOverModal.vue', () => {
  let wrapper: VueWrapper;

  const mockPayload: GameOverPayload = {
    winner: 'w',
    winnerName: 'SpeedKnight',
    reason: 'checkmate',
    message: 'Checkmate! SpeedKnight wins!',
    finalFen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    totalMoves: 4,
    durationSeconds: 45,
  };

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('renders victory title and message when isWinner is true', () => {
    wrapper = mount(GameOverModal, {
      props: {
        modelValue: true,
        payload: mockPayload,
        isWinner: true,
      },
    });

    expect(document.body.textContent).toContain('VICTORY! 🏆🎉');
    const msg = document.body.querySelector('[data-testid="game-over-message"]');
    expect(msg?.textContent).toContain('Checkmate! SpeedKnight wins!');
  });

  it('renders draw title when isDraw is true', () => {
    wrapper = mount(GameOverModal, {
      props: {
        modelValue: true,
        payload: {
          ...mockPayload,
          winner: 'draw',
          reason: 'stalemate',
          message: 'Stalemate! Game is a draw.',
        },
        isDraw: true,
      },
    });

    expect(document.body.textContent).toContain("It's a Draw! ⚖️");
  });

  it('renders match stats correctly', () => {
    wrapper = mount(GameOverModal, {
      props: {
        modelValue: true,
        payload: mockPayload,
        isWinner: false,
      },
    });

    expect(document.body.textContent).toContain('checkmate');
    expect(document.body.textContent).toContain('4'); // totalMoves
    expect(document.body.textContent).toContain('45s'); // durationSeconds
  });

  it('emits rematch event on primary button click', async () => {
    wrapper = mount(GameOverModal, {
      props: {
        modelValue: true,
        payload: mockPayload,
      },
    });

    const rematchBtn = document.body.querySelector('[data-testid="request-rematch-btn"]') as HTMLButtonElement;
    expect(rematchBtn).not.toBeNull();
    rematchBtn.click();

    expect(wrapper.emitted('rematch')).toHaveLength(1);
  });

  it('emits lobby event on secondary button click', async () => {
    wrapper = mount(GameOverModal, {
      props: {
        modelValue: true,
        payload: mockPayload,
      },
    });

    const lobbyBtn = document.body.querySelector('[data-testid="return-lobby-btn"]') as HTMLButtonElement;
    expect(lobbyBtn).not.toBeNull();
    lobbyBtn.click();

    expect(wrapper.emitted('lobby')).toHaveLength(1);
  });
});
