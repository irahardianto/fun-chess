import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ScenarioGuideOverlay from '../ScenarioGuideOverlay.vue';
import type { TutorialStep } from '@fun-chess/shared';

describe('ScenarioGuideOverlay.vue', () => {
  const mockStep: TutorialStep = {
    id: 'test-step-1',
    stepNumber: 1,
    instruction: 'Advance your pawn to e4 to claim the center!',
    conceptExplanation: 'Pawns can move 2 squares on their first move.',
    hint: 'Look at your e2 pawn.',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playerColor: 'w',
    allowedMoves: [{ from: 'e2', to: 'e4' }],
    explanationOnSuccess: 'Well done! The pawn controls center squares.',
  };

  it('renders step progress pill and main instruction text', () => {
    const wrapper = mount(ScenarioGuideOverlay, {
      props: {
        step: mockStep,
        currentStepIndex: 0,
        totalSteps: 3,
        hintsUsed: 0,
      },
    });

    expect(wrapper.find('.guide-step-pill').text()).toBe('Step 1 of 3');
    expect(wrapper.find('.instruction-main-text').text()).toBe(mockStep.instruction);
    expect(wrapper.find('.instruction-concept-text').text()).toContain(mockStep.conceptExplanation);
  });

  it('displays hints badge when hints have been used', () => {
    const wrapper = mount(ScenarioGuideOverlay, {
      props: {
        step: mockStep,
        currentStepIndex: 1,
        totalSteps: 3,
        hintsUsed: 2,
      },
    });

    expect(wrapper.find('.guide-hints-badge').text()).toContain('2 Hints Used');
  });

  it('displays active hint bubble when activeHint is provided', () => {
    const wrapper = mount(ScenarioGuideOverlay, {
      props: {
        step: mockStep,
        currentStepIndex: 0,
        totalSteps: 1,
        activeHint: 'Push the e2 pawn two squares forward to e4.',
      },
    });

    expect(wrapper.find('.guide-hint-bubble').exists()).toBe(true);
    expect(wrapper.find('.bubble-text').text()).toBe('Push the e2 pawn two squares forward to e4.');
  });

  it('renders hint bubble in-flow within guide container without obscuring board ranks', () => {
    const wrapper = mount(ScenarioGuideOverlay, {
      props: {
        step: mockStep,
        currentStepIndex: 0,
        totalSteps: 1,
        activeHint: 'Push the e2 pawn two squares forward to e4.',
      },
    });

    const guideContainer = wrapper.find('.scenario-guide-container');
    expect(guideContainer.exists()).toBe(true);

    const hintBubble = guideContainer.find('.guide-hint-bubble');
    expect(hintBubble.exists()).toBe(true);

    // Verify it is placed inside the in-flow DOM hierarchy within the guide container
    expect(hintBubble.find('.mascot-avatar-small').text()).toBe('🐶');
    expect(hintBubble.find('.bubble-speaker').text()).toBe('Peanut’s Hint:');
    expect(hintBubble.find('.bubble-text').text()).toBe('Push the e2 pawn two squares forward to e4.');
  });

  it('does not render hint bubble when activeHint is null', () => {
    const wrapper = mount(ScenarioGuideOverlay, {
      props: {
        step: mockStep,
        currentStepIndex: 0,
        totalSteps: 1,
        activeHint: null,
      },
    });

    expect(wrapper.find('.guide-hint-bubble').exists()).toBe(false);
  });

  it('emits askHint event when Hint button is clicked', async () => {
    const wrapper = mount(ScenarioGuideOverlay, {
      props: {
        step: mockStep,
        currentStepIndex: 0,
        totalSteps: 2,
      },
    });

    const buttons = wrapper.findAll('button');
    const hintBtn = buttons.find((b) => b.text().includes('Hint'));
    expect(hintBtn).toBeDefined();

    await hintBtn?.trigger('click');
    expect(wrapper.emitted('askHint')).toBeTruthy();
  });

  it('emits resetStep event when Reset button is clicked', async () => {
    const wrapper = mount(ScenarioGuideOverlay, {
      props: {
        step: mockStep,
        currentStepIndex: 0,
        totalSteps: 2,
      },
    });

    const buttons = wrapper.findAll('button');
    const resetBtn = buttons.find((b) => b.text().includes('Reset'));
    expect(resetBtn).toBeDefined();

    await resetBtn?.trigger('click');
    expect(wrapper.emitted('resetStep')).toBeTruthy();
  });
});
