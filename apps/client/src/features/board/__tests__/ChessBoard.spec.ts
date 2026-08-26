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
});
