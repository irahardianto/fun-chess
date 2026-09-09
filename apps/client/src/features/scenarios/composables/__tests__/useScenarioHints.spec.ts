import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import type { TutorialStep } from '@fun-chess/shared';
import { useScenarioHints } from '../useScenarioHints';

describe('useScenarioHints composable (MAJ-030)', () => {
  const mockStepWithMoves: TutorialStep = {
    id: 'step-1',
    stepNumber: 1,
    instruction: 'Advance pawn to e4',
    hint: 'Move e2 to e4',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    allowedMoves: [{ from: 'e2', to: 'e4' }],
    explanationOnSuccess: 'Good!',
  };

  const mockStepWithHighlights: TutorialStep = {
    id: 'step-2',
    stepNumber: 2,
    instruction: 'Observe knight control',
    hint: 'Look at the highlighted squares',
    setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    highlightSquares: ['b1', 'c3'],
    explanationOnSuccess: 'Great!',
  };

  it('initializes with zero hints used and null hint state', () => {
    const hints = useScenarioHints();
    expect(hints.hintsUsedCurrentAttempt.value).toBe(0);
    expect(hints.activeHint.value).toBeNull();
    expect(hints.hintGlowSquare.value).toBeNull();
    expect(hints.hintTargetSquare.value).toBeNull();
  });

  it('reveals hint and sets target squares from allowedMoves', () => {
    const currentStep = ref<TutorialStep | null>(mockStepWithMoves);
    const hints = useScenarioHints({ currentStep });

    hints.revealHint();

    expect(hints.hintsUsedCurrentAttempt.value).toBe(1);
    expect(hints.activeHint.value).toBe('Move e2 to e4');
    expect(hints.hintGlowSquare.value).toBe('e2');
    expect(hints.hintTargetSquare.value).toBe('e4');
  });

  it('reveals hint and sets target squares from highlightSquares when allowedMoves is empty', () => {
    const currentStep = ref<TutorialStep | null>(mockStepWithHighlights);
    const hints = useScenarioHints({ currentStep });

    hints.revealHint();

    expect(hints.hintsUsedCurrentAttempt.value).toBe(1);
    expect(hints.activeHint.value).toBe('Look at the highlighted squares');
    expect(hints.hintGlowSquare.value).toBe('b1');
    expect(hints.hintTargetSquare.value).toBe('c3');
  });

  it('clears active hint and target squares with resetStepHints without resetting count', () => {
    const currentStep = ref<TutorialStep | null>(mockStepWithMoves);
    const hints = useScenarioHints({ currentStep });

    hints.revealHint();
    expect(hints.hintsUsedCurrentAttempt.value).toBe(1);

    hints.resetStepHints();
    expect(hints.activeHint.value).toBeNull();
    expect(hints.hintGlowSquare.value).toBeNull();
    expect(hints.hintTargetSquare.value).toBeNull();
    expect(hints.hintsUsedCurrentAttempt.value).toBe(1);
  });

  it('resets all hint state and counter with resetAllHints', () => {
    const currentStep = ref<TutorialStep | null>(mockStepWithMoves);
    const hints = useScenarioHints({ currentStep });

    hints.revealHint();
    expect(hints.hintsUsedCurrentAttempt.value).toBe(1);

    hints.resetAllHints();
    expect(hints.hintsUsedCurrentAttempt.value).toBe(0);
    expect(hints.activeHint.value).toBeNull();
  });

  it('triggers auto-hint reveal when mistakes count reaches 2', () => {
    const currentStep = ref<TutorialStep | null>(mockStepWithMoves);
    const hints = useScenarioHints({ currentStep });

    // 1 mistake -> does not reveal
    hints.checkAutoHint(1);
    expect(hints.activeHint.value).toBeNull();

    // 2 mistakes -> reveals
    hints.checkAutoHint(2);
    expect(hints.activeHint.value).toBe('Move e2 to e4');
    expect(hints.hintsUsedCurrentAttempt.value).toBe(1);

    // Subsequent call does not increment if activeHint is already present
    hints.checkAutoHint(3);
    expect(hints.hintsUsedCurrentAttempt.value).toBe(1);
  });
});
