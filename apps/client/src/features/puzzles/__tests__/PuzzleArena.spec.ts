import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { Puzzle } from '@fun-chess/shared';
import PuzzleArena from '../PuzzleArena.vue';
import { InMemoryPuzzleProgressStore } from '../store/in_memory_puzzle_progress.store';
import PuzzleBoardWrapper from '../components/PuzzleBoardWrapper.vue';
import RatingClimbHud from '../components/RatingClimbHud.vue';
import StreakHud from '../components/StreakHud.vue';
import PuzzleCompletionModal from '../components/PuzzleCompletionModal.vue';
import PromotionModal from '../../modals/PromotionModal.vue';

// Mock audio & confetti to avoid web API dependencies in jsdom
vi.mock('@/composables/useAudio', () => ({
  useAudio: () => ({
    playMove: vi.fn(),
    playCapture: vi.fn(),
    playCheck: vi.fn(),
    playVictory: vi.fn(),
    playError: vi.fn(),
    playPickup: vi.fn(),
    playStarEarned: vi.fn(),
  }),
}));

vi.mock('@/composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrate: vi.fn(),
    celebrateVictory: vi.fn(),
    celebrateDraw: vi.fn(),
  }),
}));

describe('PuzzleArena.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Themed Drills Mode (mode="themed_drills")', () => {
    it('renders Themed Drills header, streak HUD, and drill progress tag', () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      expect(wrapper.find('[data-testid="puzzle-arena"]').exists()).toBe(true);
      expect(wrapper.find('.arena-header-title').text()).toContain('Royal Forks');
      expect(wrapper.findComponent(StreakHud).exists()).toBe(true);
      expect(wrapper.find('[data-testid="drill-progress-tag"]').text()).toContain('Drill 1 /');
      expect(wrapper.findComponent(RatingClimbHud).exists()).toBe(false);
    });

    it('emits back and exit when back button is clicked in header', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const backBtn = wrapper.find('[data-testid="back-btn"]');
      await backBtn.trigger('click');

      expect(wrapper.emitted('back')).toBeTruthy();
      expect(wrapper.emitted('exit')).toBeTruthy();
    });

    it('renders active puzzle guide card with Tactical Goal Banner and "Why" rationale', () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      expect(wrapper.find('[data-testid="puzzle-guide-slot"]').exists()).toBe(true);
      expect(wrapper.find('.puzzle-card-title').text()).toContain('Knight Fork on c7 #1');
      expect(wrapper.find('[data-testid="puzzle-tactical-goal"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="puzzle-tactical-goal"]').text()).toContain(
        'Deliver Nc7+ to fork King and a8 Rook'
      );
      expect(wrapper.find('[data-testid="puzzle-why-callout"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="puzzle-why-callout"]').text()).toContain(
        'Deliver Nc7+ to fork King'
      );
      expect(wrapper.find('.turn-indicator-pill').text()).toContain('⚪ White to Move');
      expect(wrapper.find('.puzzle-meta-chips').text()).toContain('novice');
      expect(wrapper.find('.puzzle-meta-chips').text()).toContain('~650 Elo');
      expect(wrapper.find('.puzzle-meta-chips').text()).toContain('fork');
      expect(wrapper.findComponent(PuzzleBoardWrapper).exists()).toBe(true);
    });

    it('handles progressive hint stepping (Tier 1 -> Tier 2 -> Tier 3)', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      expect(boardWrapper.props('hintLevel')).toBe(0);

      // Step 1: Request Tier 1 Nudge
      boardWrapper.vm.$emit('request-hint');
      await wrapper.vm.$nextTick();
      expect(boardWrapper.props('hintLevel')).toBe(1);
      expect(boardWrapper.props('hintData')).not.toBeNull();
      expect(boardWrapper.props('hintData')?.tier).toBe('piece_nudge');

      // Step 2: Request Tier 2 Target
      boardWrapper.vm.$emit('request-hint');
      await wrapper.vm.$nextTick();
      expect(boardWrapper.props('hintLevel')).toBe(2);
      expect(boardWrapper.props('hintData')?.tier).toBe('target_glow');

      // Step 3: Request Tier 3 Full Solution
      boardWrapper.vm.$emit('request-hint');
      await wrapper.vm.$nextTick();
      expect(boardWrapper.props('hintLevel')).toBe(3);
      expect(boardWrapper.props('hintData')?.tier).toBe('full_solution');
      expect(boardWrapper.props('hintData')?.solutionSan).toBeTruthy();
    });

    it('handles wrong move with feedback and mistake state', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);

      // Apply wrong move: e2e4 instead of b5c7
      boardWrapper.vm.$emit('move', { from: 'a2', to: 'a4' });
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="puzzle-feedback-banner"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="puzzle-feedback-banner"]').text()).toContain('Not quite');
      // Verify Zero-CLS floating toast structure: mounted in arena-board-slot, NOT expanding puzzle-info-card
      expect(wrapper.find('.arena-board-slot').find('[data-testid="puzzle-feedback-banner"]').exists()).toBe(true);
      expect(wrapper.find('.puzzle-info-card').find('[data-testid="puzzle-feedback-banner"]').exists()).toBe(false);

      // Shake animation expires after timer
      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.puzzle-info-card').classes()).not.toContain('is-shaking');
    });

    it('plays correct moves, triggers bot response, solves puzzle, and emits completed', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);

      // Ply 0: Player moves b5 to c7
      boardWrapper.vm.$emit('move', { from: 'b5', to: 'c7' });
      await wrapper.vm.$nextTick();

      // Bot responds after 450ms delay with e8d8
      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();

      // Ply 2: Player moves c7 to a8
      boardWrapper.vm.$emit('move', { from: 'c7', to: 'a8' });
      await wrapper.vm.$nextTick();

      // Puzzle complete!
      expect(wrapper.emitted('completed')).toBeTruthy();
      expect(wrapper.emitted('completed')![0]).toEqual([3]);

      // Completion modal should be open
      const completionModal = wrapper.findComponent(PuzzleCompletionModal);
      expect(completionModal.props('modelValue')).toBe(true);
      expect(completionModal.props('stars')).toBe(3);
    });

    it('advances to next puzzle when modal next button is clicked', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      // Solve first puzzle: b5c7 -> e8d8 -> c7a8
      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      boardWrapper.vm.$emit('move', { from: 'b5', to: 'c7' });
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();
      boardWrapper.vm.$emit('move', { from: 'c7', to: 'a8' });
      await wrapper.vm.$nextTick();

      const completionModal = wrapper.findComponent(PuzzleCompletionModal);
      expect(completionModal.props('modelValue')).toBe(true);

      // Click Next
      completionModal.vm.$emit('next');
      await wrapper.vm.$nextTick();

      // Next puzzle in fork pack should now be loaded
      expect(wrapper.find('[data-testid="drill-progress-tag"]').text()).toContain('Drill 2 /');
      expect(wrapper.find('.puzzle-card-title').text()).toContain('Knight Fork on c7 #2');
      expect(completionModal.props('modelValue')).toBe(false);
    });

    it('dismisses PuzzleCompletionModal when modal emits close (UX-WARN-03)', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      // Solve first puzzle: b5c7 -> e8d8 -> c7a8
      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      boardWrapper.vm.$emit('move', { from: 'b5', to: 'c7' });
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();
      boardWrapper.vm.$emit('move', { from: 'c7', to: 'a8' });
      await wrapper.vm.$nextTick();

      const completionModal = wrapper.findComponent(PuzzleCompletionModal);
      expect(completionModal.props('modelValue')).toBe(true);

      // Dismiss dialog via @close event (e.g. clicking the (X) button)
      completionModal.vm.$emit('close');
      await wrapper.vm.$nextTick();

      expect(completionModal.props('modelValue')).toBe(false);

      // Reset position restores attempt and resets isCompletionDismissed
      const resetBtn = wrapper.find('[data-testid="puzzle-reset-btn"]');
      await resetBtn.trigger('click');
      await wrapper.vm.$nextTick();

      // Solve again
      boardWrapper.vm.$emit('move', { from: 'b5', to: 'c7' });
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();
      boardWrapper.vm.$emit('move', { from: 'c7', to: 'a8' });
      await wrapper.vm.$nextTick();

      expect(completionModal.props('modelValue')).toBe(true);
    });

    it('dismisses PuzzleCompletionModal when modal emits update:model-value with false (UX-WARN-03)', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      // Solve first puzzle: b5c7 -> e8d8 -> c7a8
      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      boardWrapper.vm.$emit('move', { from: 'b5', to: 'c7' });
      await wrapper.vm.$nextTick();
      vi.advanceTimersByTime(500);
      await wrapper.vm.$nextTick();
      boardWrapper.vm.$emit('move', { from: 'c7', to: 'a8' });
      await wrapper.vm.$nextTick();

      const completionModal = wrapper.findComponent(PuzzleCompletionModal);
      expect(completionModal.props('modelValue')).toBe(true);

      // Dismiss dialog via @update:model-value false
      completionModal.vm.$emit('update:modelValue', false);
      await wrapper.vm.$nextTick();

      expect(completionModal.props('modelValue')).toBe(false);
    });

    it('resets attempt when reset position button is clicked', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      // Make a wrong move first
      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      boardWrapper.vm.$emit('move', { from: 'e2', to: 'e4' });
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="puzzle-feedback-banner"]').exists()).toBe(true);

      // Click Reset Position
      const resetBtn = wrapper.find('[data-testid="puzzle-reset-btn"]');
      await resetBtn.trigger('click');

      expect(wrapper.find('[data-testid="puzzle-feedback-banner"]').exists()).toBe(false);
    });

    it('skips puzzle when skip button is clicked', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      expect(wrapper.find('[data-testid="drill-progress-tag"]').text()).toContain('Drill 1 /');

      const skipBtn = wrapper.find('[data-testid="puzzle-skip-btn"]');
      await skipBtn.trigger('click');

      expect(wrapper.find('[data-testid="drill-progress-tag"]').text()).toContain('Drill 2 /');
    });

    it('updates theme and reloads puzzle when initialTheme prop changes', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      expect(wrapper.find('.arena-header-title').text()).toContain('Royal Forks');

      await wrapper.setProps({ initialTheme: 'pin' });
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.arena-header-title').text()).toContain('Sneaky Pins');
    });
  });

  describe('Adaptive Ladder Mode (mode="adaptive_ladder")', () => {
    it('renders Adaptive Ladder header and RatingClimbHud', () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'adaptive_ladder',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      expect(wrapper.find('.arena-header-title').text()).toBe('Adaptive Rating Ladder');
      expect(wrapper.findComponent(RatingClimbHud).exists()).toBe(true);
      expect(wrapper.findComponent(RatingClimbHud).text()).toContain('Pawn Novice');
      expect(wrapper.findComponent(RatingClimbHud).text()).toContain('800');
      expect(wrapper.findComponent(StreakHud).exists()).toBe(false);
    });

    it('solves puzzle in ladder mode, updates Elo & streak, and passes ratingDelta to modal', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'adaptive_ladder',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      const puzzle = (wrapper.vm as unknown as { activePuzzle: Puzzle }).activePuzzle;
      expect(puzzle).not.toBeNull();

      // Solve the ladder puzzle plies
      for (let i = 0; i < puzzle.moves.length; i += 2) {
        const uci = puzzle.moves[i]!;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci.length > 4 ? uci.charAt(4) : undefined;
        boardWrapper.vm.$emit('move', { from, to, promotion: promo });
        await wrapper.vm.$nextTick();

        if (i + 1 < puzzle.moves.length) {
          vi.advanceTimersByTime(500);
          await wrapper.vm.$nextTick();
        }
      }

      // Check solve celebration
      expect(wrapper.emitted('completed')).toBeTruthy();
      const completionModal = wrapper.findComponent(PuzzleCompletionModal);
      expect(completionModal.props('modelValue')).toBe(true);
      expect(completionModal.props('ratingDelta')).toBeGreaterThan(0);

      // Check ladder rating updated in store
      const updatedProgress = await store.getProgress();
      expect(updatedProgress.ratingProfile.rating).toBeGreaterThan(800);
      expect(updatedProgress.ratingProfile.bestStreak).toBe(1);
    });

    it('handles skip in ladder mode by recording skip and picking next ladder puzzle', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const updateRatingSpy = vi.spyOn(store, 'updateRating');
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'adaptive_ladder',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const skipBtn = wrapper.find('[data-testid="puzzle-skip-btn"]');
      await skipBtn.trigger('click');
      await flushPromises();

      // Ladder rating/streak registers attempt
      expect(updateRatingSpy).toHaveBeenCalled();
      expect(wrapper.findComponent(RatingClimbHud).exists()).toBe(true);
    });
  });

  describe('Promotion Modal Flow', () => {
    it('opens PromotionModal on promotionRequired emit and executes move on select', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      const promotionModal = wrapper.findComponent(PromotionModal);

      expect(promotionModal.props('modelValue')).toBe(false);

      await boardWrapper.vm.$emit('promotionRequired', { from: 'e7', to: 'e8' });
      await flushPromises();

      expect(promotionModal.props('modelValue')).toBe(true);

      await promotionModal.vm.$emit('select', 'q');
      await flushPromises();

      expect(promotionModal.props('modelValue')).toBe(false);
    });

    it('closes PromotionModal on cancel without executing move', async () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      const promoModal = wrapper.findComponent(PromotionModal);

      boardWrapper.vm.$emit('promotionRequired', { from: 'e7', to: 'e8' });
      await wrapper.vm.$nextTick();

      expect(promoModal.props('modelValue')).toBe(true);

      promoModal.vm.$emit('cancel');
      await wrapper.vm.$nextTick();

      expect(promoModal.props('modelValue')).toBe(false);
    });
  });

  describe('Pre-Move Solution Spoiler Elimination & Pedagogical Scaffolding', () => {
    it('does not display learningSummary, keyTakeaway, or stepExplanations in the pre-move guide card before solving', () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const guideSlot = wrapper.find('[data-testid="puzzle-guide-slot"]');
      expect(guideSlot.exists()).toBe(true);

      const activePuzzle = (wrapper.vm as unknown as { activePuzzle: Puzzle }).activePuzzle;
      expect(activePuzzle).toBeDefined();

      // In pre-move state, verify zero spoilers in the arena DOM
      if (activePuzzle?.learningSummary) {
        expect(guideSlot.text()).not.toContain(activePuzzle.learningSummary);
      }
      if (activePuzzle?.keyTakeaway) {
        expect(guideSlot.text()).not.toContain(activePuzzle.keyTakeaway);
      }
      if (activePuzzle?.stepExplanations?.length) {
        for (const step of activePuzzle.stepExplanations) {
          expect(guideSlot.text()).not.toContain(step.explanation);
        }
      }

      // Pre-move guide only displays thematic objective teasers
      expect(wrapper.find('[data-testid="puzzle-tactical-goal"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="puzzle-why-callout"]').exists()).toBe(true);
    });

    it('initializes board wrapper with active puzzle state', () => {
      const store = new InMemoryPuzzleProgressStore();
      const wrapper = mount(PuzzleArena, {
        props: {
          mode: 'themed_drills',
          initialTheme: 'fork',
          customStore: store,
        },
        global: {
          stubs: {
            teleport: true,
          },
        },
      });

      const boardWrapper = wrapper.findComponent(PuzzleBoardWrapper);
      expect(boardWrapper.exists()).toBe(true);
      expect(boardWrapper.props('fen')).toBeDefined();
      expect(typeof boardWrapper.props('fen')).toBe('string');
      expect(boardWrapper.props('interactive')).toBe(true);
      expect(boardWrapper.props('orientation')).toMatch(/^[wb]$/);
      expect(boardWrapper.props('turn')).toMatch(/^[wb]$/);
    });
  });
});
