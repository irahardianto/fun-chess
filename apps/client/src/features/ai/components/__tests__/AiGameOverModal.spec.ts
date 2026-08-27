import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import AiGameOverModal from '../AiGameOverModal.vue';
import { peanutPup } from '../../data/index';
import type { GameOverPayload } from '@fun-chess/shared';

// Mock confetti
vi.mock('../../../composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrate: vi.fn(),
    celebrateVictory: vi.fn(),
    celebrateDraw: vi.fn(),
  }),
}));

describe('AiGameOverModal.vue', () => {
  let wrapper: VueWrapper;

  const mockPayload: GameOverPayload = {
    winner: 'w',
    winnerName: 'You',
    reason: 'checkmate',
    message: 'Checkmate! You defeated Peanut the Pup! 🏆',
    finalFen: 'r1bqkb1r/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 1',
    totalMoves: 8,
    durationSeconds: 45,
  };

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('renders victory headline, is-victory styling class, mascot dialogue, and match statistics when player wins', () => {
    wrapper = mount(AiGameOverModal, {
      props: {
        modelValue: true,
        isPlayerWinner: true,
        payload: mockPayload,
        mascot: peanutPup,
        takebackCount: 1,
        hintsCount: 2,
      },
    });

    expect(document.body.textContent).toContain('Victory!');
    const headline = document.body.querySelector('.banner-headline');
    expect(headline?.classList.contains('is-victory')).toBe(true);

    const region = document.body.querySelector('[role="region"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toBe('Game Over Summary');

    expect(document.body.textContent).toContain('Peanut the Pup');
    expect(document.body.textContent).toContain('45s');
    expect(document.body.textContent).toContain('8'); // total moves
    expect(document.body.textContent).toContain('1'); // takebackCount
    expect(document.body.textContent).toContain('2'); // hintsCount
  });

  it('emits "rematch" when verb-first Play Again button is clicked', async () => {
    wrapper = mount(AiGameOverModal, {
      props: {
        modelValue: true,
        isPlayerWinner: true,
        payload: mockPayload,
        mascot: peanutPup,
      },
    });

    const rematchBtn = document.body.querySelector('[data-testid="ai-rematch-btn"]') as HTMLButtonElement;
    expect(rematchBtn).not.toBeNull();
    expect(rematchBtn.textContent).toContain('Play Again with Peanut');
    rematchBtn.click();

    expect(wrapper.emitted('rematch')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('emits "changeOpponent" when verb-first Choose Another Mascot button is clicked', async () => {
    wrapper = mount(AiGameOverModal, {
      props: {
        modelValue: true,
        payload: mockPayload,
        mascot: peanutPup,
      },
    });

    const changeOpponentBtn = document.body.querySelector('[data-testid="ai-change-opponent-btn"]') as HTMLButtonElement;
    expect(changeOpponentBtn).not.toBeNull();
    expect(changeOpponentBtn.textContent).toContain('Choose Another Mascot');
    changeOpponentBtn.click();

    expect(wrapper.emitted('changeOpponent')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('emits "lobby" when verb-first Return to Main Menu button is clicked', async () => {
    wrapper = mount(AiGameOverModal, {
      props: {
        modelValue: true,
        payload: mockPayload,
        mascot: peanutPup,
      },
    });

    const lobbyBtn = document.body.querySelector('[data-testid="ai-return-lobby-btn"]') as HTMLButtonElement;
    expect(lobbyBtn).not.toBeNull();
    expect(lobbyBtn.textContent).toContain('Return to Main Menu');
    lobbyBtn.click();

    expect(wrapper.emitted('lobby')).toBeTruthy();
  });

  it('automatically focuses the primary call-to-action button (Play Again) upon modal display', async () => {
    wrapper = mount(AiGameOverModal, {
      props: {
        modelValue: true,
        payload: mockPayload,
        mascot: peanutPup,
      },
      attachTo: document.body,
    });

    await wrapper.vm.$nextTick();

    const rematchBtn = document.body.querySelector('[data-testid="ai-rematch-btn"]') as HTMLButtonElement;
    expect(rematchBtn).not.toBeNull();
    expect(document.activeElement).toBe(rematchBtn);
  });
});
