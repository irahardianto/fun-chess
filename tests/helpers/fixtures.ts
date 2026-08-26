import { MovePayload } from '@fun-chess/shared';

export const TEST_PLAYERS = {
  HOST: {
    name: 'Leo',
  },
  JOINER: {
    name: 'Maya',
  },
};

/**
 * Fool's Mate: Shortest possible checkmate (2 moves per side)
 * 1. f3 e5
 * 2. g4 Qh4#
 */
export const FOOLS_MATE_SEQUENCE: { white: MovePayload; black: MovePayload }[] = [
  {
    white: { from: 'f2', to: 'f3' },
    black: { from: 'e7', to: 'e5' },
  },
  {
    white: { from: 'g2', to: 'g4' },
    black: { from: 'd8', to: 'h4' },
  },
];

/**
 * Scholar's Mate: Classic 4-move checkmate
 * 1. e4 e5
 * 2. Bc4 Nc6
 * 3. Qh5 Nf6
 * 4. Qxf7#
 */
export const SCHOLARS_MATE_SEQUENCE: { white: MovePayload; black?: MovePayload }[] = [
  {
    white: { from: 'e2', to: 'e4' },
    black: { from: 'e7', to: 'e5' },
  },
  {
    white: { from: 'f1', to: 'c4' },
    black: { from: 'b8', to: 'c6' },
  },
  {
    white: { from: 'd1', to: 'h5' },
    black: { from: 'g8', to: 'f6' },
  },
  {
    white: { from: 'h5', to: 'f7' },
  },
];

/**
 * Check Sequence: 2 plies leading to Check
 * 1. e4 f6
 * 2. Qh5+ (Check!)
 */
export const CHECK_SEQUENCE = {
  move1_white: { from: 'e2', to: 'e4' } as MovePayload,
  move1_black: { from: 'f7', to: 'f6' } as MovePayload,
  move2_white: { from: 'd1', to: 'h5' } as MovePayload, // Checks black king on e8
};
