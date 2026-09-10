import { Chess } from 'chess.js';
import type {
  PieceColor,
  PieceType,
  MaterialAdvantageSummary,
} from '@fun-chess/shared';
import {
  createSafeChess,
  isValidFen,
  calculateBoardMaterial,
  PIECE_CENTIPAWN_VALUES,
  PIECE_VALUES,
  STANDARD_PIECE_POINTS,
  PIECE_STANDARD_POINTS,
} from '@fun-chess/shared';
import { logger } from '@/platform/telemetry';

export {
  calculateBoardMaterial,
  PIECE_CENTIPAWN_VALUES,
  PIECE_VALUES,
  STANDARD_PIECE_POINTS,
  PIECE_STANDARD_POINTS,
};

/**
 * Counts total centipawn material on board for a specific color (excluding king).
 */
export function calculateColorMaterial(fen: string, color: PieceColor, _customLogger?: unknown): number {
  if (!isValidFen(fen)) return 0;
  try {
    const chess = createSafeChess(fen);
    const summary = calculateBoardMaterial(chess);
    const counts = color === 'w' ? summary.whiteCounts : summary.blackCounts;
    let total = 0;
    for (const [pieceType, count] of Object.entries(counts)) {
      if (pieceType !== 'k') {
        total += count * (PIECE_CENTIPAWN_VALUES[pieceType as PieceType] ?? 0);
      }
    }
    return total;
  } catch (err) {
    logger.debug('Failed to calculate color material from FEN', {
      operation: 'calculate_color_material',
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Counts piece occurrences for a given color.
 */
export function getPieceCounts(fen: string, color: PieceColor, _customLogger?: unknown): Record<PieceType, number> {
  const counts: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  if (!isValidFen(fen)) return counts;
  try {
    const chess = createSafeChess(fen);
    const summary = calculateBoardMaterial(chess);
    return { ...(color === 'w' ? summary.whiteCounts : summary.blackCounts) };
  } catch (err) {
    logger.debug('Failed to get piece counts from FEN', {
      operation: 'get_piece_counts',
      error: err instanceof Error ? err.message : String(err),
    });
    return counts;
  }
}

/**
 * Counts total centipawn material on board for white and black (excluding kings).
 */
export function getMaterialCount(chess: Chess): { white: number; black: number; net: number } {
  const summary = calculateBoardMaterial(chess);
  let white = 0;
  let black = 0;

  for (const [pieceType, count] of Object.entries(summary.whiteCounts)) {
    if (pieceType !== 'k') {
      white += count * (PIECE_CENTIPAWN_VALUES[pieceType as PieceType] ?? 0);
    }
  }

  for (const [pieceType, count] of Object.entries(summary.blackCounts)) {
    if (pieceType !== 'k') {
      black += count * (PIECE_CENTIPAWN_VALUES[pieceType as PieceType] ?? 0);
    }
  }

  return {
    white,
    black,
    net: white - black,
  };
}

/**
 * Identifies the highest-value opponent piece captured by comparing piece counts.
 */
export function findCapturedPiece(
  chessInit: Chess,
  chessFinal: Chess,
  oppColor: PieceColor,
): PieceType | undefined {
  const countPieces = (ch: Chess, col: PieceColor): Record<PieceType, number> => {
    const summary = calculateBoardMaterial(ch);
    return { ...(col === 'w' ? summary.whiteCounts : summary.blackCounts) };
  };

  const oppInitCounts = countPieces(chessInit, oppColor);
  const oppFinalCounts = countPieces(chessFinal, oppColor);

  const pieceOrder: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
  for (const pt of pieceOrder) {
    if (oppFinalCounts[pt] < oppInitCounts[pt]) {
      return pt;
    }
  }
  return undefined;
}

/**
 * Formats material advantage summary from centipawn delta.
 */
export function formatMaterialAdvantage(
  deltaCp: number,
  capturedPiece?: PieceType,
): MaterialAdvantageSummary {
  if (deltaCp >= 850) {
    return {
      pieceType: capturedPiece ?? 'q',
      netCentipawns: deltaCp,
      netPoints: 9,
      formattedAdvantage: '+9 Queen ♛',
      isDecisive: true,
    };
  }

  if (deltaCp >= 400) {
    return {
      pieceType: capturedPiece ?? 'r',
      netCentipawns: deltaCp,
      netPoints: 5,
      formattedAdvantage: '+5 Rook ♜',
      isDecisive: true,
    };
  }

  if (deltaCp >= 230) {
    return {
      pieceType: capturedPiece ?? 'n',
      netCentipawns: deltaCp,
      netPoints: 3,
      formattedAdvantage: '+3 Piece (Bishop/Knight) ⚔️',
      isDecisive: true,
    };
  }

  if (deltaCp >= 130) {
    return {
      pieceType: capturedPiece,
      netCentipawns: deltaCp,
      netPoints: 2,
      formattedAdvantage: '+2 The Exchange 🔄',
      isDecisive: false,
    };
  }

  if (deltaCp >= 50) {
    return {
      pieceType: capturedPiece ?? 'p',
      netCentipawns: deltaCp,
      netPoints: 1,
      formattedAdvantage: '+1 Pawn ♟️',
      isDecisive: false,
    };
  }

  return {
    netCentipawns: deltaCp,
    netPoints: 0,
    formattedAdvantage: 'Positional Advantage ⚡',
    isDecisive: false,
  };
}

/**
 * Calculates net material advantage gained between initial and final position.
 * Delta is calculated from player perspective:
 * Delta = Material_final - Material_initial
 */
export function calculateMaterialDelta(
  initialFen: string,
  finalFen: string,
  playerColor: PieceColor,
  isCheckmate = false,
): MaterialAdvantageSummary {
  if (isCheckmate) {
    return {
      netCentipawns: 10000,
      netPoints: Infinity,
      formattedAdvantage: 'Checkmate 👑',
      isDecisive: true,
    };
  }

  if (!isValidFen(initialFen) || !isValidFen(finalFen)) {
    return {
      netCentipawns: 0,
      netPoints: 0,
      formattedAdvantage: 'Positional Advantage ⚡',
      isDecisive: false,
    };
  }

  let chessInit: Chess;
  let chessFinal: Chess;
  try {
    chessInit = createSafeChess(initialFen);
    chessFinal = createSafeChess(finalFen);
  } catch (err) {
    logger.debug('Failed to parse FEN in calculateMaterialDelta', {
      operation: 'calculate_material_delta',
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      netCentipawns: 0,
      netPoints: 0,
      formattedAdvantage: 'Positional Advantage ⚡',
      isDecisive: false,
    };
  }

  if (chessFinal.isCheckmate()) {
    return {
      netCentipawns: 10000,
      netPoints: Infinity,
      formattedAdvantage: 'Checkmate 👑',
      isDecisive: true,
    };
  }

  const initMat = getMaterialCount(chessInit);
  const finalMat = getMaterialCount(chessFinal);

  const initBalance = playerColor === 'w' ? initMat.white - initMat.black : initMat.black - initMat.white;
  const finalBalance = playerColor === 'w' ? finalMat.white - finalMat.black : finalMat.black - finalMat.white;
  const deltaCp = finalBalance - initBalance;

  const oppColor: PieceColor = playerColor === 'w' ? 'b' : 'w';
  const capturedPiece = findCapturedPiece(chessInit, chessFinal, oppColor);

  return formatMaterialAdvantage(deltaCp, capturedPiece);
}
