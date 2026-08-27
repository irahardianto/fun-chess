import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProgressiveHintLayer, { squareToCoordinates } from '../ProgressiveHintLayer.vue';

describe('ProgressiveHintLayer.vue', () => {
  it('renders nothing when hint level is 0', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 0,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
  });

  it('renders Tier 1 nudge square overlay when level is 1', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 1,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
  });

  it('renders Tier 2 beacon overlay when level is 2', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 2,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
  });

  it('renders Tier 3 vector arrow and ghost piece when level is 3', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 3,
        sourceSquare: 'e2',
        targetSquare: 'e4',
        movingPiece: { type: 'p', color: 'w' },
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-ghost-piece"]').exists()).toBe(true);
  });

  it('renders slot content inside hint-board-anchor without breaking layout', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 1,
        sourceSquare: 'e2',
        targetSquare: 'e4',
      },
      slots: {
        default: '<div class="test-board-content">Mock Board</div>',
      },
    });

    const anchor = wrapper.find('.hint-board-anchor');
    expect(anchor.exists()).toBe(true);
    expect(anchor.find('.test-board-content').exists()).toBe(true);
    expect(anchor.find('.test-board-content').text()).toBe('Mock Board');
    expect(anchor.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
  });

  it('hides controls when showControls is false', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 2,
        sourceSquare: 'e2',
        targetSquare: 'e4',
        showControls: false,
      },
    });

    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
    expect(wrapper.find('.hint-controls-wrapper').exists()).toBe(false);
    expect(wrapper.find('[data-testid="request-hint-btn"]').exists()).toBe(false);
  });

  it('renders speech bubble and callouts when hintData is provided', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 3,
        showControls: true,
        hintData: {
          level: 3,
          tier: 'full_solution',
          sourceSquare: 'e2',
          targetSquare: 'e4',
          message: 'Advance the king pawn!',
          mascotDialogue: 'Good luck solving!',
          solutionSan: 'e4',
        },
      },
    });

    expect(wrapper.find('[data-testid="hint-speech-bubble"]').exists()).toBe(true);
    expect(wrapper.find('.hint-bubble-message').text()).toContain('Advance the king pawn!');
    expect(wrapper.find('.hint-mascot-dialogue').text()).toContain('Good luck solving!');
    expect(wrapper.find('.solution-san').text()).toBe('e4');
  });

  it('emits request-hint event on button click', async () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 0,
        showControls: true,
      },
    });

    const button = wrapper.find('[data-testid="request-hint-btn"]');
    await button.trigger('click');

    expect(wrapper.emitted('request-hint')).toHaveLength(1);
  });

  it('computes correct square coordinates for White and Black orientations', () => {
    // White orientation: e2 (file e=4, rank 2 => col 4, row 6)
    const e2White = squareToCoordinates('e2', 'w');
    expect(e2White.x).toBe(50);
    expect(e2White.y).toBe(75);
    expect(e2White.centerX).toBe(56.25);
    expect(e2White.centerY).toBe(81.25);

    // White orientation: e4 (col 4, row 4)
    const e4White = squareToCoordinates('e4', 'w');
    expect(e4White.x).toBe(50);
    expect(e4White.y).toBe(50);
    expect(e4White.centerX).toBe(56.25);
    expect(e4White.centerY).toBe(56.25);

    // Black orientation: e2 (file e=4 => col 7-4=3, rank 2 => row 2-1=1)
    const e2Black = squareToCoordinates('e2', 'b');
    expect(e2Black.x).toBe(37.5);
    expect(e2Black.y).toBe(12.5);
    expect(e2Black.centerX).toBe(43.75);
    expect(e2Black.centerY).toBe(18.75);
  });

  it('applies computed inline styles to nudge square, beacon square, and SVG arrow line', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 3,
        sourceSquare: 'e2',
        targetSquare: 'e4',
        orientation: 'w',
      },
    });

    const nudgeSquare = wrapper.find('[data-testid="hint-nudge-square"]');
    expect(nudgeSquare.exists()).toBe(true);
    expect(nudgeSquare.attributes('style')).toContain('left: 50%');
    expect(nudgeSquare.attributes('style')).toContain('top: 75%');
    expect(nudgeSquare.attributes('style')).toContain('width: 12.5%');
    expect(nudgeSquare.attributes('style')).toContain('height: 12.5%');

    const beaconSquare = wrapper.find('[data-testid="hint-beacon-square"]');
    expect(beaconSquare.exists()).toBe(true);
    expect(beaconSquare.attributes('style')).toContain('left: 50%');
    expect(beaconSquare.attributes('style')).toContain('top: 50%');
    expect(beaconSquare.attributes('style')).toContain('width: 12.5%');
    expect(beaconSquare.attributes('style')).toContain('height: 12.5%');

    const arrowSvg = wrapper.find('[data-testid="hint-arrow-svg"]');
    expect(arrowSvg.exists()).toBe(true);
    const arrowLine = arrowSvg.find('.hint-arrow-line');
    expect(arrowLine.exists()).toBe(true);
    expect(arrowLine.attributes('x1')).toBe('56.25');
    expect(arrowLine.attributes('y1')).toBe('81.25');
    expect(arrowLine.attributes('x2')).toBe('56.25');
    expect(arrowLine.attributes('y2')).toBe('56.25');
  });

  it('updates coordinates dynamically when orientation is flipped to Black', () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 3,
        sourceSquare: 'e2',
        targetSquare: 'e4',
        orientation: 'b',
      },
    });

    const nudgeSquare = wrapper.find('[data-testid="hint-nudge-square"]');
    expect(nudgeSquare.attributes('style')).toContain('left: 37.5%');
    expect(nudgeSquare.attributes('style')).toContain('top: 12.5%');

    const beaconSquare = wrapper.find('[data-testid="hint-beacon-square"]');
    expect(beaconSquare.attributes('style')).toContain('left: 37.5%');
    expect(beaconSquare.attributes('style')).toContain('top: 37.5%');
  });

  it('transitions hint tiers dynamically (Level 0 -> Tier 1 -> Tier 2 -> Tier 3) on prop updates', async () => {
    const wrapper = mount(ProgressiveHintLayer, {
      props: {
        hintLevel: 0,
        sourceSquare: 'c3',
        targetSquare: 'b5',
        showControls: true,
      },
    });

    // Level 0: No highlights, 0 active meter dots, button says 'Tactical Hint'
    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
    expect(wrapper.findAll('.meter-dot.is-active')).toHaveLength(0);
    expect(wrapper.find('[data-testid="request-hint-btn"]').text()).toContain('Tactical Hint');

    // Transition to Tier 1: Nudge
    await wrapper.setProps({
      hintLevel: 1,
      hintData: {
        level: 1,
        tier: 'piece_nudge',
        sourceSquare: 'c3',
        message: 'Look at your Knight on c3!',
      },
    });
    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(false);
    expect(wrapper.findAll('.meter-dot.is-active')).toHaveLength(1);
    expect(wrapper.find('[data-testid="request-hint-btn"]').text()).toContain('Target Beacon');
    expect(wrapper.find('.hint-bubble-message').text()).toBe('Look at your Knight on c3!');

    // Transition to Tier 2: Target Glow
    await wrapper.setProps({
      hintLevel: 2,
      hintData: {
        level: 2,
        tier: 'target_glow',
        sourceSquare: 'c3',
        targetSquare: 'b5',
        message: 'Aim for the b5 outpost!',
      },
    });
    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
    expect(wrapper.findAll('.meter-dot.is-active')).toHaveLength(2);
    expect(wrapper.find('[data-testid="request-hint-btn"]').text()).toContain('Solution Line');

    // Transition to Tier 3: Full Solution Vector
    await wrapper.setProps({
      hintLevel: 3,
      movingPiece: { type: 'n', color: 'w' },
      hintData: {
        level: 3,
        tier: 'full_solution',
        sourceSquare: 'c3',
        targetSquare: 'b5',
        solutionSan: 'Nb5',
        message: 'Play 1. Nb5 to fork!',
      },
    });
    expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hint-ghost-piece"]').exists()).toBe(true);
    expect(wrapper.findAll('.meter-dot.is-active')).toHaveLength(3);
    expect(wrapper.find('[data-testid="request-hint-btn"]').text()).toContain('Solution Revealed');
    expect(wrapper.find('[data-testid="request-hint-btn"]').attributes('disabled')).toBeDefined();
  });

  describe('Refutation Threat Square Overlay', () => {
    it('renders pulsing refutation threat square overlay when threatSquare prop is provided', () => {
      const wrapper = mount(ProgressiveHintLayer, {
        props: {
          threatSquare: 'c7',
          orientation: 'w',
        },
      });

      const threatSquare = wrapper.find('[data-testid="refutation-threat-square"]');
      expect(threatSquare.exists()).toBe(true);
      // c7 file c=2 => col 2 (25%), rank 7 => row 1 (12.5%)
      expect(threatSquare.attributes('style')).toContain('left: 25%');
      expect(threatSquare.attributes('style')).toContain('top: 12.5%');
      expect(threatSquare.attributes('style')).toContain('width: 12.5%');
      expect(threatSquare.attributes('style')).toContain('height: 12.5%');
    });

    it('renders threat square from hintData.threatSquares when prop is omitted', () => {
      const wrapper = mount(ProgressiveHintLayer, {
        props: {
          hintData: {
            level: 1,
            tier: 'piece_nudge',
            sourceSquare: 'e2',
            threatSquares: ['e7'],
            message: 'Watch out for threats!',
          },
          orientation: 'w',
        },
      });

      const threatSquare = wrapper.find('[data-testid="refutation-threat-square"]');
      expect(threatSquare.exists()).toBe(true);
      expect(threatSquare.attributes('style')).toContain('left: 50%');
      expect(threatSquare.attributes('style')).toContain('top: 12.5%');
    });
  });
});
