import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChessScenario } from '@fun-chess/shared';
import { useScenarioStepNavigation } from '../useScenarioStepNavigation';

describe('useScenarioStepNavigation composable (MAJ-030)', () => {
  const mockScenario: ChessScenario = {
    id: 'test-scenario',
    title: 'Test Lesson',
    subtitle: 'Learn Chess Steps',
    category: 'fundamentals',
    difficulty: 'beginner',
    targetAgeGroup: 'all',
    icon: '♟️',
    description: 'A test navigation scenario',
    estimatedMinutes: 2,
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        instruction: 'Move 1',
        hint: 'Hint 1',
        setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        playerColor: 'w',
        explanationOnSuccess: 'Step 1 success',
      },
      {
        id: 'step-2',
        stepNumber: 2,
        instruction: 'Move 2',
        hint: 'Hint 2',
        setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        playerColor: 'b',
        explanationOnSuccess: 'Step 2 success',
      },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes properly with null scenario', () => {
    const nav = useScenarioStepNavigation();
    expect(nav.scenario.value).toBeNull();
    expect(nav.currentStepIndex.value).toBe(0);
    expect(nav.totalSteps.value).toBe(0);
    expect(nav.currentStep.value).toBeNull();
    expect(nav.isCompleted.value).toBe(false);
  });

  it('initializes with provided scenario and activates step 0', () => {
    const nav = useScenarioStepNavigation({ scenario: mockScenario });
    expect(nav.scenario.value?.id).toBe('test-scenario');
    expect(nav.currentStepIndex.value).toBe(0);
    expect(nav.totalSteps.value).toBe(2);
    expect(nav.currentStep.value?.id).toBe('step-1');
    expect(nav.playerColor.value).toBe('w');
    expect(nav.currentFen.value).toBe(mockScenario.steps[0]?.setupFen);
  });

  it('loads step by index and updates currentFen and currentStep', () => {
    const onStepLoaded = vi.fn();
    const nav = useScenarioStepNavigation({
      scenario: mockScenario,
      onStepLoaded,
    });

    nav.loadStep(1);

    expect(nav.currentStepIndex.value).toBe(1);
    expect(nav.currentStep.value?.id).toBe('step-2');
    expect(nav.playerColor.value).toBe('b');
    expect(nav.currentFen.value).toBe(mockScenario.steps[1]?.setupFen);
    expect(onStepLoaded).toHaveBeenCalledWith(mockScenario.steps[1], 1);
  });

  it('resets current step via resetCurrentStep', () => {
    const nav = useScenarioStepNavigation({ scenario: mockScenario });
    nav.loadStep(1);
    expect(nav.currentStepIndex.value).toBe(1);

    nav.resetCurrentStep();
    expect(nav.currentStepIndex.value).toBe(1);
    expect(nav.currentFen.value).toBe(mockScenario.steps[1]?.setupFen);
  });

  it('navigates to next step or completes via nextStep', () => {
    const nav = useScenarioStepNavigation({ scenario: mockScenario });

    // Step 0 -> Step 1
    nav.nextStep();
    expect(nav.currentStepIndex.value).toBe(1);
    expect(nav.isCompleted.value).toBe(false);

    // Step 1 -> Complete
    nav.nextStep();
    expect(nav.isCompleted.value).toBe(true);
  });

  it('advances or completes step after delay and emits onStepOutcome', () => {
    const onStepOutcome = vi.fn();
    const nav = useScenarioStepNavigation({
      scenario: mockScenario,
      onStepOutcome,
      getStarsAwarded: () => 3,
    });

    // Step 0 -> advance
    nav.advanceOrCompleteStep(500);

    vi.advanceTimersByTime(500);

    expect(nav.currentStepIndex.value).toBe(1);
    expect(onStepOutcome).toHaveBeenCalledWith({
      type: 'scenario_step_completed',
      starsAwarded: 3,
      isLessonComplete: false,
    });

    // Step 1 -> complete
    nav.advanceOrCompleteStep(500);

    vi.advanceTimersByTime(500);

    expect(nav.isCompleted.value).toBe(true);
    expect(onStepOutcome).toHaveBeenCalledWith({
      type: 'scenario_step_completed',
      starsAwarded: 3,
      isLessonComplete: true,
    });
  });

  it('loads new scenario cleanly via loadScenario', () => {
    const nav = useScenarioStepNavigation();
    nav.loadScenario(mockScenario);

    expect(nav.scenario.value?.id).toBe('test-scenario');
    expect(nav.currentStepIndex.value).toBe(0);
    expect(nav.totalSteps.value).toBe(2);
    expect(nav.isCompleted.value).toBe(false);
  });
});
