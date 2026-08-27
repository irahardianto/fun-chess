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
    const firstSquareWhite = wrapperWhite.findAllComponents({ name: 'ChessSquare' })[0];
    expect(firstSquareWhite.props('square')).toBe('a8');

    const wrapperBlack = mount(ChessBoard, {
      props: { fen: DEFAULT_FEN, orientation: 'b' },
    });
    const firstSquareBlack = wrapperBlack.findAllComponents({ name: 'ChessSquare' })[0];
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
    expect(activeSquares[0].props('square')).toBe('e4');
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
});
