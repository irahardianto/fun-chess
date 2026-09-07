import { bench, describe } from 'vitest';
import { Chess } from 'chess.js';
import { ChessEngine } from '../chess_engine.js';
import type { MoveResult } from '@fun-chess/shared';

describe('Server ChessEngine Benchmark', () => {
  // Build a 20-move game history
  const chess = new Chess();
  const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4', 'Bb4+', 'Bd2', 'Bxd2+', 'Nbxd2', 'd5', 'exd5', 'Nxd5', 'Qb3', 'Nce7'];
  const moveHistory: MoveResult[] = [];

  for (let i = 0; i < moves.length; i++) {
    const san = moves[i]!;
    const res = chess.move(san);
    moveHistory.push({
      from: res.from,
      to: res.to,
      san: res.san,
      piece: res.piece as any,
      color: res.color as any,
      captured: res.captured ? (res.captured as any) : undefined,
      flags: res.flags,
      fen: chess.fen(),
      moveNumber: i + 1,
      timestamp: Date.now(),
    });
  }

  const currentFen = chess.fen();
  const nextMove = { from: 'O-O', to: 'O-O' }; // castle
  // Or legal move
  const legalMove = { from: 'e1', to: 'g1' }; // castle kingside

  bench('isThreefoldRepetition with 20-move history', () => {
    ChessEngine.isThreefoldRepetition(chess, moveHistory);
  });

  bench('calculateMaterialAndCaptures', () => {
    ChessEngine.calculateMaterialAndCaptures(chess);
  });

  bench('extractGameState', () => {
    ChessEngine.extractGameState(chess, { from: 'c6', to: 'e7' }, moveHistory);
  });

  bench('validateAndApplyMove with 20-move history', () => {
    ChessEngine.validateAndApplyMove(currentFen, legalMove, 'w', moveHistory);
  });
});
