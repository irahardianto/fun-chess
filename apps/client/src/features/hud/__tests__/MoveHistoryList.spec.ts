import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MoveHistoryList from '../MoveHistoryList.vue';
import type { MoveResult } from '@fun-chess/shared';

describe('MoveHistoryList.vue', () => {
  it('renders empty history notice when moves list is empty', () => {
    const wrapper = mount(MoveHistoryList, {
      props: {
        moves: [],
      },
    });

    expect(wrapper.find('.empty-history').exists()).toBe(true);
    expect(wrapper.text()).toContain('0 plies');
  });

  it('renders paired chess move notation for White and Black', () => {
    const mockMoves: MoveResult[] = [
      {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        piece: 'p',
        color: 'w',
        flags: 'n',
        fen: 'fen_1',
        moveNumber: 1,
        timestamp: Date.now(),
      },
      {
        from: 'e7',
        to: 'e5',
        san: 'e5',
        piece: 'p',
        color: 'b',
        flags: 'n',
        fen: 'fen_2',
        moveNumber: 1,
        timestamp: Date.now(),
      },
      {
        from: 'g1',
        to: 'f3',
        san: 'Nf3',
        piece: 'n',
        color: 'w',
        flags: 'n',
        fen: 'fen_3',
        moveNumber: 2,
        timestamp: Date.now(),
      },
    ];

    const wrapper = mount(MoveHistoryList, {
      props: {
        moves: mockMoves,
      },
    });

    expect(wrapper.text()).toContain('3 plies');
    const rows = wrapper.findAll('[data-testid="move-history-row"]');
    expect(rows).toHaveLength(2);

    expect(rows[0].text()).toContain('1.');
    expect(rows[0].text()).toContain('e4');
    expect(rows[0].text()).toContain('e5');

    expect(rows[1].text()).toContain('2.');
    expect(rows[1].text()).toContain('Nf3');
  });
});
