import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import ScenarioCompletionModal from '../ScenarioCompletionModal.vue';
import { ALL_SCENARIOS } from '../../data';

// Mock confetti
vi.mock('../../../composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrateVictory: vi.fn(),
    celebrateDraw: vi.fn(),
  }),
}));

describe('ScenarioCompletionModal.vue', () => {
  let wrapper: VueWrapper;
  const mockScenario = ALL_SCENARIOS[0];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('renders modal with stars, accuracy, and scenario title when visible', () => {
    wrapper = mount(ScenarioCompletionModal, {
      props: {
        modelValue: true,
        scenario: mockScenario,
        stars: 3,
        accuracy: 100,
        hintsUsed: 0,
        hasNextLesson: true,
      },
    });

    expect(document.body.textContent).toContain(mockScenario.title);
    expect(document.body.textContent).toContain('3 / 3 Stars Earned!');
    expect(document.body.textContent).toContain('100%');
    expect(document.body.textContent).toContain('Next Lesson');
  });

  it('displays appropriate praise message based on star rating', async () => {
    wrapper = mount(ScenarioCompletionModal, {
      props: {
        modelValue: true,
        scenario: mockScenario,
        stars: 3,
        accuracy: 100,
        hintsUsed: 0,
      },
    });

    expect(document.body.querySelector('.scenario-praise-text')?.textContent).toContain('Flawless victory');

    await wrapper.setProps({ stars: 2 });
    expect(document.body.querySelector('.scenario-praise-text')?.textContent).toContain('Great job');

    await wrapper.setProps({ stars: 1 });
    expect(document.body.querySelector('.scenario-praise-text')?.textContent).toContain('Lesson completed');
  });

  it('emits retry event when Try Again button is clicked', async () => {
    wrapper = mount(ScenarioCompletionModal, {
      props: {
        modelValue: true,
        scenario: mockScenario,
        stars: 2,
        accuracy: 80,
        hintsUsed: 1,
      },
    });

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const retryBtn = buttons.find((b) => b.textContent?.includes('Try Again'));
    expect(retryBtn).toBeDefined();

    retryBtn?.click();
    expect(wrapper.emitted('retry')).toBeTruthy();
  });

  it('emits nextLesson event when Next Lesson button is clicked', async () => {
    wrapper = mount(ScenarioCompletionModal, {
      props: {
        modelValue: true,
        scenario: mockScenario,
        stars: 3,
        accuracy: 100,
        hintsUsed: 0,
        hasNextLesson: true,
      },
    });

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const nextBtn = buttons.find((b) => b.textContent?.includes('Next Lesson'));
    expect(nextBtn).toBeDefined();

    nextBtn?.click();
    expect(wrapper.emitted('nextLesson')).toBeTruthy();
  });

  it('emits backToAcademy event when Academy button is clicked', async () => {
    wrapper = mount(ScenarioCompletionModal, {
      props: {
        modelValue: true,
        scenario: mockScenario,
        stars: 3,
        accuracy: 100,
        hintsUsed: 0,
      },
    });

    const buttons = Array.from(document.body.querySelectorAll('button'));
    const academyBtn = buttons.find((b) => b.textContent?.includes('Academy'));
    expect(academyBtn).toBeDefined();

    academyBtn?.click();
    expect(wrapper.emitted('backToAcademy')).toBeTruthy();
  });
});
