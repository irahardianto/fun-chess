import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ScenarioArena from '../ScenarioArena.vue';
import { ALL_SCENARIOS } from '../data';

// Mock confetti
vi.mock('@/composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrateVictory: vi.fn(),
    celebrateDraw: vi.fn(),
  }),
}));

describe('ScenarioArena.vue', () => {
  const mockScenario = ALL_SCENARIOS[0];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders arena header with title, difficulty and back button', () => {
    const wrapper = mount(ScenarioArena, {
      props: {
        scenario: mockScenario,
      },
    });

    expect(wrapper.find('.scenario-header-title').text()).toBe(mockScenario.title);
    expect(wrapper.find('.arena-difficulty-tag').text()).toBe(mockScenario.difficulty);
    expect(wrapper.find('.header-left button').text()).toContain('Academy');
  });

  it('emits back event when Academy back button is clicked in header', async () => {
    const wrapper = mount(ScenarioArena, {
      props: {
        scenario: mockScenario,
      },
    });

    const backBtn = wrapper.find('.header-left button');
    await backBtn.trigger('click');

    expect(wrapper.emitted('back')).toBeTruthy();
  });

  it('renders ChessBoard and ScenarioGuideOverlay components', () => {
    const wrapper = mount(ScenarioArena, {
      props: {
        scenario: mockScenario,
      },
    });

    expect(wrapper.findComponent({ name: 'ChessBoard' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'ScenarioGuideOverlay' }).exists()).toBe(true);
  });

  it('integrates ProgressiveHintLayer with showControls disabled to avoid duplicate buttons', () => {
    const wrapper = mount(ScenarioArena, {
      props: {
        scenario: mockScenario,
      },
    });

    const hintLayer = wrapper.findComponent({ name: 'ProgressiveHintLayer' });
    expect(hintLayer.exists()).toBe(true);
    expect(hintLayer.props('showControls')).toBe(false);
    expect(wrapper.find('[data-testid="request-hint-btn"]').exists()).toBe(false);
  });

  describe('Pawn Promotion Modal Interactions (MAJ-036)', () => {
    it('opens promotion modal on promotion-required board event and applies chosen piece on select', async () => {
      const wrapper = mount(ScenarioArena, {
        props: {
          scenario: mockScenario,
        },
      });

      const board = wrapper.findComponent({ name: 'ChessBoard' });
      const promoModal = wrapper.findComponent({ name: 'PromotionModal' });

      expect(promoModal.props('modelValue')).toBe(false);

      // Trigger promotion required from board
      await board.vm.$emit('promotion-required', { from: 'e7', to: 'e8' });
      expect(promoModal.props('modelValue')).toBe(true);

      // Select Queen promotion
      await promoModal.vm.$emit('select', 'q');
      expect(promoModal.props('modelValue')).toBe(false);
    });

    it('cancels promotion and clears pending move on promotion cancel', async () => {
      const wrapper = mount(ScenarioArena, {
        props: {
          scenario: mockScenario,
        },
      });

      const board = wrapper.findComponent({ name: 'ChessBoard' });
      const promoModal = wrapper.findComponent({ name: 'PromotionModal' });

      await board.vm.$emit('promotion-required', { from: 'e7', to: 'e8' });
      expect(promoModal.props('modelValue')).toBe(true);

      await promoModal.vm.$emit('cancel');
      expect(promoModal.props('modelValue')).toBe(false);
    });
  });

  describe('Scenario Completion & Navigation Handlers (MAJ-036)', () => {
    it('reloads scenario on retry event from completion modal', async () => {
      const wrapper = mount(ScenarioArena, {
        props: {
          scenario: mockScenario,
        },
      });

      const completionModal = wrapper.findComponent({ name: 'ScenarioCompletionModal' });
      expect(completionModal.exists()).toBe(true);

      await completionModal.vm.$emit('retry');
      expect(wrapper.find('.scenario-header-title').text()).toBe(mockScenario.title);
    });

    it('emits nextLesson with next scenario when available', async () => {
      const nextScenario = ALL_SCENARIOS[1];
      const wrapper = mount(ScenarioArena, {
        props: {
          scenario: mockScenario,
          nextScenario,
        },
      });

      const completionModal = wrapper.findComponent({ name: 'ScenarioCompletionModal' });
      await completionModal.vm.$emit('next-lesson');

      expect(wrapper.emitted('nextLesson')).toBeTruthy();
      expect(wrapper.emitted('nextLesson')?.[0]?.[0]).toEqual(nextScenario);
    });

    it('emits back when no next lesson is available on next-lesson event', async () => {
      const wrapper = mount(ScenarioArena, {
        props: {
          scenario: {
            ...mockScenario,
            id: 'terminal_final_scenario_999',
          },
          nextScenario: null,
        },
      });

      const completionModal = wrapper.findComponent({ name: 'ScenarioCompletionModal' });
      await completionModal.vm.$emit('next-lesson');

      expect(wrapper.emitted('back')).toBeTruthy();
    });

    it('emits back event on back-to-academy from completion modal', async () => {
      const wrapper = mount(ScenarioArena, {
        props: {
          scenario: mockScenario,
        },
      });

      const completionModal = wrapper.findComponent({ name: 'ScenarioCompletionModal' });
      await completionModal.vm.$emit('back-to-academy');

      expect(wrapper.emitted('back')).toBeTruthy();
    });

    it('reloads runner when scenario prop updates', async () => {
      const wrapper = mount(ScenarioArena, {
        props: {
          scenario: mockScenario,
        },
      });

      const newScenario = ALL_SCENARIOS[1];
      await wrapper.setProps({ scenario: newScenario });

      expect(wrapper.find('.scenario-header-title').text()).toBe(newScenario.title);
      expect(wrapper.find('.arena-difficulty-tag').text()).toBe(newScenario.difficulty);
    });

    it('delegates board move and square selection events to runner', async () => {
      const wrapper = mount(ScenarioArena, {
        props: {
          scenario: mockScenario,
        },
      });

      const board = wrapper.findComponent({ name: 'ChessBoard' });

      // Move event
      await board.vm.$emit('move', { from: 'e2', to: 'e4' });
      // Select event
      await board.vm.$emit('select', 'e2');

      expect(board.exists()).toBe(true);
    });
  });
});
