import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChessBoard from '../ChessBoard.vue';
import type { Square } from '@fun-chess/shared';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('ChessBoard.vue', () => {
  it('renders 64 squares in standard grid layout', () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
      },
    });

    const squares = wrapper.findAllComponents({ name: 'ChessSquare' });
    expect(squares).toHaveLength(64);
  });

  it('renders pieces on starting ranks correctly', () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
      },
    });

    const pieces = wrapper.findAllComponents({ name: 'ChessPiece' });
    expect(pieces).toHaveLength(32); // 16 white + 16 black pieces
  });

  it('reverses rank and file display when orientation is Black', () => {
    const wrapperWhite = mount(ChessBoard, {
      props: { fen: DEFAULT_FEN, orientation: 'w' },
    });
    const firstSquareWhite = wrapperWhite.findAllComponents({ name: 'ChessSquare' })[0]!;
    expect(firstSquareWhite.props('square')).toBe('a8');

    const wrapperBlack = mount(ChessBoard, {
      props: { fen: DEFAULT_FEN, orientation: 'b' },
    });
    const firstSquareBlack = wrapperBlack.findAllComponents({ name: 'ChessSquare' })[0]!;
    expect(firstSquareBlack.props('square')).toBe('h1');
  });

  it('emits select event when a square is clicked', async () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
      },
    });

    const e2Square = wrapper.findAllComponents({ name: 'ChessSquare' }).find(
      (s) => s.props('square') === 'e2'
    );
    expect(e2Square).toBeDefined();

    await e2Square!.trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')?.[0]).toEqual(['e2']);
  });

  it('emits move event when clicking a legal destination with an active selection', async () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
        selectedSquare: 'e2' as Square,
        legalMoves: ['e3' as Square, 'e4' as Square],
      },
    });

    const e4Square = wrapper.findAllComponents({ name: 'ChessSquare' }).find(
      (s) => s.props('square') === 'e4'
    );
    expect(e4Square).toBeDefined();

    await e4Square!.trigger('click');
    expect(wrapper.emitted('move')).toHaveLength(1);
    expect(wrapper.emitted('move')?.[0]).toEqual([{ from: 'e2', to: 'e4' }]);
  });

  it('does not emit move or select when board is disabled', async () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
        disabled: true,
        selectedSquare: 'e2' as Square,
        legalMoves: ['e4' as Square],
      },
    });

    const e4Square = wrapper.findAllComponents({ name: 'ChessSquare' }).find(
      (s) => s.props('square') === 'e4'
    );
    await e4Square!.trigger('click');

    expect(wrapper.emitted('move')).toBeUndefined();
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('implements single roving tabindex across all 64 squares', () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
        selectedSquare: 'e4' as Square,
      },
    });

    const squares = wrapper.findAllComponents({ name: 'ChessSquare' });
    const activeSquares = squares.filter((s) => s.props('isSquareActive') === true);
    const inactiveSquares = squares.filter((s) => s.props('isSquareActive') === false);

    expect(activeSquares).toHaveLength(1);
    expect(activeSquares[0]!.props('square')).toBe('e4');
    expect(inactiveSquares).toHaveLength(63);
  });

  it('supports 2D keyboard navigation using Arrow keys and Home/End', async () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
        selectedSquare: 'e2' as Square,
      },
    });

    const findSquare = (sq: Square) =>
      wrapper.findAllComponents({ name: 'ChessSquare' }).find((s) => s.props('square') === sq);

    const e2Square = findSquare('e2');
    expect(e2Square).toBeDefined();

    // ArrowUp: from e2 (row 6) up to e3 (row 5)
    await e2Square!.trigger('keydown', { key: 'ArrowUp' });
    const e3Square = findSquare('e3');
    expect(e3Square!.props('isSquareActive')).toBe(true);
    expect(findSquare('e2')!.props('isSquareActive')).toBe(false);

    // ArrowRight: from e3 (col 4) right to f3 (col 5)
    await e3Square!.trigger('keydown', { key: 'ArrowRight' });
    const f3Square = findSquare('f3');
    expect(f3Square!.props('isSquareActive')).toBe(true);

    // ArrowLeft: from f3 left to e3
    await f3Square!.trigger('keydown', { key: 'ArrowLeft' });
    expect(findSquare('e3')!.props('isSquareActive')).toBe(true);

    // ArrowDown: from e3 down to e2
    await findSquare('e3')!.trigger('keydown', { key: 'ArrowDown' });
    expect(findSquare('e2')!.props('isSquareActive')).toBe(true);

    // Home: from e2 to a2 (first cell in row)
    await findSquare('e2')!.trigger('keydown', { key: 'Home' });
    expect(findSquare('a2')!.props('isSquareActive')).toBe(true);

    // End: from a2 to h2 (last cell in row)
    await findSquare('a2')!.trigger('keydown', { key: 'End' });
    expect(findSquare('h2')!.props('isSquareActive')).toBe(true);
  });

  it('clamps keyboard navigation at board boundaries', async () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
        selectedSquare: 'a8' as Square,
      },
    });

    const findSquare = (sq: Square) =>
      wrapper.findAllComponents({ name: 'ChessSquare' }).find((s) => s.props('square') === sq);

    const a8Square = findSquare('a8');
    // Top-left boundary: ArrowUp and ArrowLeft should stay at a8
    await a8Square!.trigger('keydown', { key: 'ArrowUp' });
    expect(findSquare('a8')!.props('isSquareActive')).toBe(true);

    await a8Square!.trigger('keydown', { key: 'ArrowLeft' });
    expect(findSquare('a8')!.props('isSquareActive')).toBe(true);
  });

  it('supports Ctrl+Home, Ctrl+End, PageUp, PageDown, and ignores unmapped keys', async () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
        selectedSquare: 'd4' as Square,
      },
    });

    const findSquare = (sq: Square) =>
      wrapper.findAllComponents({ name: 'ChessSquare' }).find((s) => s.props('square') === sq);

    const d4Square = findSquare('d4');

    // PageUp jumps to row 0 (rank 8)
    await d4Square!.trigger('keydown', { key: 'PageUp' });
    expect(findSquare('d8')!.props('isSquareActive')).toBe(true);

    // PageDown jumps to row 7 (rank 1)
    await findSquare('d8')!.trigger('keydown', { key: 'PageDown' });
    expect(findSquare('d1')!.props('isSquareActive')).toBe(true);

    // Ctrl+Home jumps to top-left (a8)
    await findSquare('d1')!.trigger('keydown', { key: 'Home', ctrlKey: true });
    expect(findSquare('a8')!.props('isSquareActive')).toBe(true);

    // Ctrl+End jumps to bottom-right (h1)
    await findSquare('a8')!.trigger('keydown', { key: 'End', ctrlKey: true });
    expect(findSquare('h1')!.props('isSquareActive')).toBe(true);

    // Unhandled key (e.g. Tab or Escape)
    await findSquare('h1')!.trigger('keydown', { key: 'Tab' });
    expect(findSquare('h1')!.props('isSquareActive')).toBe(true);
  });

  it('handles piece select and drag-start events with audio feedback', async () => {
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
      },
    });

    const piece = wrapper.findComponent({ name: 'ChessPiece' });
    expect(piece.exists()).toBe(true);

    // Piece selection emits select
    await piece.vm.$emit('select', 'e2');
    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')?.[0]).toEqual(['e2']);

    // Drag start emits select
    await piece.vm.$emit('drag-start', 'd2');
    expect(wrapper.emitted('select')?.[1]).toEqual(['d2']);
  });

  it('handles drag-end: legal move, promotion, illegal destination, same square, and disabled board', async () => {
    const dummyEvent = {} as PointerEvent;
    // 1. Legal pawn move
    const wrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
        legalMoves: ['e4' as Square],
      },
    });

    const piece = wrapper.findComponent({ name: 'ChessPiece' });

    // Mock document.elementFromPoint
    const origElementFromPoint = document.elementFromPoint;
    const mockSquareEl = document.createElement('div');
    mockSquareEl.setAttribute('data-square', 'e4');
    document.elementFromPoint = () => mockSquareEl;

    await piece.vm.$emit('drag-end', 'e2', dummyEvent, { x: 100, y: 100 });
    expect(wrapper.emitted('move')).toBeTruthy();
    expect(wrapper.emitted('move')?.[0]).toEqual([{ from: 'e2', to: 'e4' }]);

    // 2. Promotion move (white pawn to rank 8)
    const promoWrapper = mount(ChessBoard, {
      props: {
        fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1',
        orientation: 'w',
        legalMoves: ['e8' as Square],
      },
    });
    const promoPiece = promoWrapper.findComponent({ name: 'ChessPiece' });
    const mockPromoSquareEl = document.createElement('div');
    mockPromoSquareEl.setAttribute('data-square', 'e8');
    document.elementFromPoint = () => mockPromoSquareEl;

    await promoPiece.vm.$emit('drag-end', 'e7', dummyEvent, { x: 100, y: 100 });
    expect(promoWrapper.emitted('promotionRequired')).toBeTruthy();
    expect(promoWrapper.emitted('promotionRequired')?.[0]).toEqual([{ from: 'e7', to: 'e8' }]);

    // 3. Black pawn promotion (black pawn to rank 1)
    const blackPromoWrapper = mount(ChessBoard, {
      props: {
        fen: '4k3/8/8/8/8/8/4p3/4K3 b - - 0 1',
        orientation: 'b',
        legalMoves: ['e1' as Square],
      },
    });
    const blackPromoPiece = blackPromoWrapper.findComponent({ name: 'ChessPiece' });
    const mockBlackPromoSquareEl = document.createElement('div');
    mockBlackPromoSquareEl.setAttribute('data-square', 'e1');
    document.elementFromPoint = () => mockBlackPromoSquareEl;

    await blackPromoPiece.vm.$emit('drag-end', 'e2', dummyEvent, { x: 100, y: 100 });
    expect(blackPromoWrapper.emitted('promotionRequired')).toBeTruthy();

    // 4. Illegal destination (not in legalMoves)
    const mockIllegalSquareEl = document.createElement('div');
    mockIllegalSquareEl.setAttribute('data-square', 'a5');
    document.elementFromPoint = () => mockIllegalSquareEl;

    await piece.vm.$emit('drag-end', 'e2', dummyEvent, { x: 100, y: 100 });
    // Should play error and not emit move
    expect(wrapper.emitted('move')).toHaveLength(1);

    // 5. Dropping on same square (targetSq === fromSq)
    const mockSameSquareEl = document.createElement('div');
    mockSameSquareEl.setAttribute('data-square', 'e2');
    document.elementFromPoint = () => mockSameSquareEl;

    await piece.vm.$emit('drag-end', 'e2', dummyEvent, { x: 100, y: 100 });
    expect(wrapper.emitted('move')).toHaveLength(1);

    // 6. Dropping outside board (null element)
    document.elementFromPoint = () => null;
    await piece.vm.$emit('drag-end', 'e2', dummyEvent, { x: 0, y: 0 });
    expect(wrapper.emitted('move')).toHaveLength(1);

    // 7. Non-interactive or disabled board ignores drag events
    const disabledWrapper = mount(ChessBoard, {
      props: {
        fen: DEFAULT_FEN,
        orientation: 'w',
        disabled: true,
      },
    });
    const disabledPiece = disabledWrapper.findComponent({ name: 'ChessPiece' });
    await disabledPiece.vm.$emit('select', 'e2');
    await disabledPiece.vm.$emit('drag-start', 'e2');
    await disabledPiece.vm.$emit('drag-end', 'e2', dummyEvent, { x: 100, y: 100 });
    expect(disabledWrapper.emitted('select')).toBeUndefined();
    expect(disabledWrapper.emitted('move')).toBeUndefined();

    // Restore original elementFromPoint
    document.elementFromPoint = origElementFromPoint;
  });
});
