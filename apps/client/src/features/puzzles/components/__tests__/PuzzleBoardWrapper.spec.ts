import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import PuzzleBoardWrapper from '../PuzzleBoardWrapper.vue';
import ChessBoard from '../../../board/ChessBoard.vue';
import ProgressiveHintLayer from '../ProgressiveHintLayer.vue';
import type { Square, HintData } from '@fun-chess/shared';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const TACTICAL_FEN = 'r1bqk2r/pppp1ppp/2n5/4p3/1b1Pn3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 6';
const PROMOTION_FEN = '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1';

describe('PuzzleBoardWrapper.vue', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
  });

  const mountWrapper = (props: Partial<InstanceType<typeof PuzzleBoardWrapper>['$props']> = {}) => {
    return mount(PuzzleBoardWrapper, {
      props: {
        fen: STARTING_FEN,
        ...props,
      },
    });
  };

  describe('Board Rendering & Structural Hierarchy', () => {
    it('renders the puzzle board wrapper container and board frame', () => {
      wrapper = mountWrapper();

      expect(wrapper.find('[data-testid="puzzle-board-wrapper"]').exists()).toBe(true);
      expect(wrapper.find('.board-relative-frame').exists()).toBe(true);
    });

    it('renders child ChessBoard component with 64 squares and piece elements', () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
      });

      const chessBoard = wrapper.findComponent(ChessBoard);
      expect(chessBoard.exists()).toBe(true);

      const squares = wrapper.findAllComponents({ name: 'ChessSquare' });
      expect(squares).toHaveLength(64);

      const pieces = wrapper.findAllComponents({ name: 'ChessPiece' });
      expect(pieces).toHaveLength(32);
    });

    it('renders child ProgressiveHintLayer overlay component', () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
      });

      const hintLayer = wrapper.findComponent(ProgressiveHintLayer);
      expect(hintLayer.exists()).toBe(true);
    });

    it('passes down board state props correctly to ChessBoard', () => {
      wrapper = mountWrapper({
        fen: TACTICAL_FEN,
        turn: 'w',
        selectedSquare: 'f3' as Square,
        legalMoves: ['e5' as Square, 'd4' as Square],
        lastMove: { from: 'e7', to: 'e5' },
        kingInCheckSquare: 'e1' as Square,
      });

      const chessBoard = wrapper.findComponent(ChessBoard);
      expect(chessBoard.props('fen')).toBe(TACTICAL_FEN);
      expect(chessBoard.props('turn')).toBe('w');
      expect(chessBoard.props('selectedSquare')).toBe('f3');
      expect(chessBoard.props('legalMoves')).toEqual(['e5', 'd4']);
      expect(chessBoard.props('lastMove')).toEqual({ from: 'e7', to: 'e5' });
      expect(chessBoard.props('kingInCheckSquare')).toBe('e1');
    });
  });

  describe('Board Orientation Flip', () => {
    it('renders White perspective by default with a8 at top-left', () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        orientation: 'w',
      });

      const chessBoard = wrapper.findComponent(ChessBoard);
      expect(chessBoard.props('orientation')).toBe('w');

      const firstSquare = wrapper.findAllComponents({ name: 'ChessSquare' })[0]!;
      expect(firstSquare.props('square')).toBe('a8');

      const hintLayer = wrapper.findComponent(ProgressiveHintLayer);
      expect(hintLayer.props('orientation')).toBe('w');
    });

    it('renders Black perspective when orientation is flipped to "b" with h1 at top-left', () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        orientation: 'b',
      });

      const chessBoard = wrapper.findComponent(ChessBoard);
      expect(chessBoard.props('orientation')).toBe('b');

      const firstSquare = wrapper.findAllComponents({ name: 'ChessSquare' })[0]!;
      expect(firstSquare.props('square')).toBe('h1');

      const hintLayer = wrapper.findComponent(ProgressiveHintLayer);
      expect(hintLayer.props('orientation')).toBe('b');
    });
  });

  describe('Move & Interaction Event Bubbling', () => {
    it('bubbles up "select" event when a square on ChessBoard is clicked', async () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
      });

      const e2Square = wrapper
        .findAllComponents({ name: 'ChessSquare' })
        .find((s) => s.props('square') === 'e2');
      expect(e2Square).toBeDefined();

      await e2Square!.trigger('click');

      expect(wrapper.emitted('select')).toHaveLength(1);
      expect(wrapper.emitted('select')?.[0]).toEqual(['e2']);
    });

    it('bubbles up "move" event when a legal move is completed on ChessBoard', async () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        selectedSquare: 'e2' as Square,
        legalMoves: ['e3' as Square, 'e4' as Square],
      });

      const e4Square = wrapper
        .findAllComponents({ name: 'ChessSquare' })
        .find((s) => s.props('square') === 'e4');
      expect(e4Square).toBeDefined();

      await e4Square!.trigger('click');

      expect(wrapper.emitted('move')).toHaveLength(1);
      expect(wrapper.emitted('move')?.[0]).toEqual([{ from: 'e2', to: 'e4' }]);
    });

    it('bubbles up "promotionRequired" event when a pawn reaches promotion rank', async () => {
      wrapper = mountWrapper({
        fen: PROMOTION_FEN,
        turn: 'w',
        selectedSquare: 'e7' as Square,
        legalMoves: ['e8' as Square],
      });

      const e8Square = wrapper
        .findAllComponents({ name: 'ChessSquare' })
        .find((s) => s.props('square') === 'e8');
      expect(e8Square).toBeDefined();

      await e8Square!.trigger('click');

      expect(wrapper.emitted('promotionRequired')).toHaveLength(1);
      expect(wrapper.emitted('promotionRequired')?.[0]).toEqual([{ from: 'e7', to: 'e8' }]);
      expect(wrapper.emitted('move')).toBeUndefined();
    });
  });

  describe('Progressive Hint Layer Rendering (Nudge, Beacon, Arrow)', () => {
    it('does not render hint overlays when hintLevel is 0 and hintData is null', () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        hintLevel: 0,
        hintData: null,
      });

      expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="hint-speech-bubble"]').exists()).toBe(false);
    });

    it('renders Tier 1 piece nudge square when hintLevel is 1', () => {
      const hintData: HintData = {
        level: 1,
        tier: 'piece_nudge',
        sourceSquare: 'e2',
        targetSquare: 'e4',
        message: 'Try moving the pawn in front of your King!',
      };

      wrapper = mountWrapper({
        fen: STARTING_FEN,
        hintLevel: 1,
        hintData,
      });

      expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="hint-speech-bubble"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('Piece: E2');
    });

    it('renders Tier 2 target beacon glow when hintLevel is 2', () => {
      const hintData: HintData = {
        level: 2,
        tier: 'target_glow',
        sourceSquare: 'e2',
        targetSquare: 'e4',
        message: 'Push the pawn 2 squares forward to control the center!',
      };

      wrapper = mountWrapper({
        fen: STARTING_FEN,
        hintLevel: 2,
        hintData,
      });

      expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="hint-speech-bubble"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('Target: E4');
    });

    it('renders Tier 3 vector arrow and solution callout when hintLevel is 3', () => {
      const hintData: HintData = {
        level: 3,
        tier: 'full_solution',
        sourceSquare: 'e2',
        targetSquare: 'e4',
        solutionSan: 'e4',
        message: 'Play e4 to seize control!',
      };

      wrapper = mountWrapper({
        fen: STARTING_FEN,
        hintLevel: 3,
        hintData,
      });

      expect(wrapper.find('[data-testid="hint-nudge-square"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="hint-beacon-square"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="hint-arrow-svg"]').exists()).toBe(true);
      expect(wrapper.find('.solution-callout').exists()).toBe(true);
      expect(wrapper.find('.solution-san').text()).toBe('e4');
    });
  });

  describe('Disabled Interaction When Puzzle is Solved or Disabled', () => {
    it('disables board interaction when disabled is true', async () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        disabled: true,
        selectedSquare: 'e2' as Square,
        legalMoves: ['e4' as Square],
      });

      const chessBoard = wrapper.findComponent(ChessBoard);
      expect(chessBoard.props('disabled')).toBe(true);
      expect(chessBoard.find('.chess-board-container').classes()).toContain('is-disabled');

      const e4Square = wrapper
        .findAllComponents({ name: 'ChessSquare' })
        .find((s) => s.props('square') === 'e4');
      await e4Square!.trigger('click');

      expect(wrapper.emitted('move')).toBeUndefined();
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('disables board interaction when interactive is false', async () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        interactive: false,
        selectedSquare: 'e2' as Square,
        legalMoves: ['e4' as Square],
      });

      const chessBoard = wrapper.findComponent(ChessBoard);
      expect(chessBoard.props('interactive')).toBe(false);
      expect(chessBoard.find('.chess-board-container').classes()).toContain('is-disabled');

      const e4Square = wrapper
        .findAllComponents({ name: 'ChessSquare' })
        .find((s) => s.props('square') === 'e4');
      await e4Square!.trigger('click');

      expect(wrapper.emitted('move')).toBeUndefined();
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('dynamically disables interaction when prop changes after puzzle is solved', async () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        disabled: false,
        selectedSquare: 'e2' as Square,
        legalMoves: ['e4' as Square],
      });

      // Initially enabled
      expect(wrapper.findComponent(ChessBoard).props('disabled')).toBe(false);

      // Transition to solved/disabled
      await wrapper.setProps({ disabled: true });

      expect(wrapper.findComponent(ChessBoard).props('disabled')).toBe(true);
      expect(wrapper.find('.chess-board-container').classes()).toContain('is-disabled');

      const e4Square = wrapper
        .findAllComponents({ name: 'ChessSquare' })
        .find((s) => s.props('square') === 'e4');
      await e4Square!.trigger('click');

      expect(wrapper.emitted('move')).toBeUndefined();
    });
  });

  describe('Hint Controls Visibility & Interaction (Decoupled Layout)', () => {
    it('renders hint action button and meter by default when showHintControls is true', () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        showHintControls: true,
      });

      expect(wrapper.find('[data-testid="request-hint-btn"]').exists()).toBe(true);
      expect(wrapper.find('.hint-tier-meter').exists()).toBe(true);
    });

    it('hides hint action button and meter when showHintControls is false (e.g. in Blitz / Rush modes)', () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        showHintControls: false,
      });

      expect(wrapper.find('[data-testid="request-hint-btn"]').exists()).toBe(false);
      expect(wrapper.find('.hint-tier-meter').exists()).toBe(false);
    });

    it('emits request-hint and requestHint when hint button is clicked', async () => {
      wrapper = mountWrapper({
        fen: STARTING_FEN,
        hintLevel: 0,
        showHintControls: true,
      });

      const hintBtn = wrapper.find('[data-testid="request-hint-btn"]');
      expect(hintBtn.exists()).toBe(true);

      await hintBtn.trigger('click');

      expect(wrapper.emitted('request-hint')).toHaveLength(1);
      expect(wrapper.emitted('requestHint')).toHaveLength(1);
    });
  });
});
