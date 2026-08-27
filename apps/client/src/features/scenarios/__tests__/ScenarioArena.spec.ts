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
});
