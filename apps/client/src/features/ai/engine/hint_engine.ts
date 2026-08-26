import { Chess, type Move } from 'chess.js';
import type {
  Square,
  PieceColor,
  PieceType,
  HintTheme,
  HintRecommendation,
  HintCalculator,
  AiSearchConfig,
} from '@fun-chess/shared';
import { MinimaxEngine } from './minimax_engine.js';

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

const HINT_SEARCH_CONFIG: AiSearchConfig = {
  depth: 2,
  blunderChance: 0,
  maxBlunderScoreDrop: 0,
  evaluationNoise: 0,
  usePst: true,
  useQuiescence: true,
  simulatedThinkTimeMs: [0, 0],
};

/**
 * Checks whether a given square coordinate is valid.
 */
function isValidSquareCoord(rank: number, file: number): boolean {
  return rank >= 1 && rank <= 8 && file >= 0 && file <= 7;
}

/**
 * Finds all opponent pieces attacked by a piece situated on a specific square.
 */
function getAttackedOpponentPieces(
  chess: Chess,
  square: Square,
  pieceType: PieceType,
  color: PieceColor,
): { square: Square; piece: PieceType }[] {
  const opponentColor: PieceColor = color === 'w' ? 'b' : 'w';
  const attacked: { square: Square; piece: PieceType }[] = [];
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]!, 10);

  const checkAndAdd = (r: number, f: number) => {
    if (!isValidSquareCoord(r, f)) return;
    const targetSq = `${String.fromCharCode(97 + f)}${r}` as Square;
    const pieceOnTarget = chess.get(targetSq);
    if (pieceOnTarget && pieceOnTarget.color === opponentColor) {
      attacked.push({ square: targetSq, piece: pieceOnTarget.type });
    }
  };

  if (pieceType === 'n') {
    const knightDeltas = [
      [2, 1], [2, -1], [-2, 1], [-2, -1],
      [1, 2], [1, -2], [-1, 2], [-1, -2],
    ];
    for (const [dr, df] of knightDeltas) {
      checkAndAdd(rank + dr!, file + df!);
    }
  } else if (pieceType === 'p') {
    const dir = color === 'w' ? 1 : -1;
    checkAndAdd(rank + dir, file - 1);
    checkAndAdd(rank + dir, file + 1);
  } else if (pieceType === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        checkAndAdd(rank + dr, file + df);
      }
    }
  } else {
    // Sliding pieces: Bishop, Rook, Queen
    const directions: [number, number][] = [];
    if (pieceType === 'b' || pieceType === 'q') {
      directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    }
    if (pieceType === 'r' || pieceType === 'q') {
      directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    }

    for (const [dr, df] of directions) {
      let curR = rank + dr;
      let curF = file + df;
      while (isValidSquareCoord(curR, curF)) {
        const targetSq = `${String.fromCharCode(97 + curF)}${curR}` as Square;
        const pieceOnTarget = chess.get(targetSq);
        if (pieceOnTarget) {
          if (pieceOnTarget.color === opponentColor) {
            attacked.push({ square: targetSq, piece: pieceOnTarget.type });
          }
          break; // Ray blocked
        }
        curR += dr;
        curF += df;
      }
    }
  }

  return attacked;
}

/**
 * Classifies the tactical concept and generates a kid-friendly explanation.
 */
export function identifyTacticalTheme(
  chessBefore: Chess,
  chessAfter: Chess,
  move: Move,
): { theme: HintTheme; explanation: string } {
  const pieceName = PIECE_NAMES[move.piece] ?? 'Piece';
  const destSquare = move.to as Square;

  // 1. Checkmate
  if (chessAfter.isCheckmate()) {
    return {
      theme: 'checkmate_threat',
      explanation: `Deliver checkmate with your ${pieceName} on ${destSquare}! 👑`,
    };
  }

  // 2. King Safety / Castling
  if (move.san.includes('O-O') || move.flags.includes('k') || move.flags.includes('q')) {
    return {
      theme: 'king_safety',
      explanation: `Castle to keep your King safe and activate your Rook! 🏰`,
    };
  }

  // 3. Pawn Promotion
  if (move.promotion || (move.piece === 'p' && (destSquare.endsWith('7') || destSquare.endsWith('2')))) {
    return {
      theme: 'pawn_promotion',
      explanation: `March your Pawn towards the back rank to promote to a Queen! 🚀`,
    };
  }

  // 4. Capture Free Piece or Win Material
  if (move.captured) {
    const capturedName = PIECE_NAMES[move.captured] ?? 'piece';
    return {
      theme: 'capture_free_piece',
      explanation: `Capture the opponent's ${capturedName} on ${destSquare}! 🎯`,
    };
  }

  // 5. Tactical Fork
  const attackedPieces = getAttackedOpponentPieces(
    chessAfter,
    destSquare,
    move.piece,
    move.color,
  );
  const valuableAttacked = attackedPieces.filter((p) => p.piece !== 'p');
  if (valuableAttacked.length >= 2 || attackedPieces.length >= 2) {
    const targets = valuableAttacked.map((p) => PIECE_NAMES[p.piece]).slice(0, 2).join(' and ');
    return {
      theme: 'fork',
      explanation: `Fork attack! Your ${pieceName} on ${destSquare} attacks multiple pieces (${targets || 'targets'}) at once! 🍴`,
    };
  }

  // 6. Escape Attack
  const opponentColor = move.color === 'w' ? 'b' : 'w';
  const pieceWasAttackedBefore = chessBefore.isAttacked(
    move.from as Square,
    opponentColor,
  );
  if (pieceWasAttackedBefore) {
    return {
      theme: 'escape_attack',
      explanation: `Move your endangered ${pieceName} to safety on ${destSquare}! 🛡️`,
    };
  }

  // 7. Center Control
  const centerSquares = ['d4', 'e4', 'd5', 'e5', 'c4', 'f4', 'c5', 'f5'];
  if (centerSquares.includes(destSquare) && chessBefore.history().length <= 16) {
    return {
      theme: 'center_control',
      explanation: `Occupy the center (${destSquare}) with your ${pieceName} to control key territory! 🌟`,
    };
  }

  // 8. General Development
  if ((move.piece === 'n' || move.piece === 'b') && (move.from.endsWith('1') || move.from.endsWith('8'))) {
    return {
      theme: 'general_development',
      explanation: `Develop your ${pieceName} to ${destSquare} to join the game! ♞`,
    };
  }

  // Default theme
  return {
    theme: 'general_development',
    explanation: `Move your ${pieceName} to ${destSquare} to improve your position! 💡`,
  };
}

/**
 * Contextual Tactical Hint Calculator engine.
 */
export class HintEngine implements HintCalculator {
  constructor(private readonly searchEngine = new MinimaxEngine()) {}

  /**
   * Calculates the best tactical move and returns an educational hint for the learner.
   */
  async calculateHint(
    fen: string,
    playerColor: PieceColor,
  ): Promise<HintRecommendation | null> {
    const chess = new Chess(fen);

    if (chess.isGameOver()) {
      return null;
    }

    if (chess.turn() !== playerColor) {
      return null;
    }

    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) {
      return null;
    }

    // Evaluate position with MinimaxEngine
    const evaluation = await this.searchEngine.findBestMove(fen, HINT_SEARCH_CONFIG);
    const chosenMove = evaluation.move;

    // Simulate move to analyze context
    const moveResult = chess.move({
      from: chosenMove.from,
      to: chosenMove.to,
      ...(chosenMove.promotion ? { promotion: chosenMove.promotion } : {}),
    });

    if (!moveResult) {
      return null;
    }

    const chessBefore = new Chess(fen);
    const { theme, explanation } = identifyTacticalTheme(chessBefore, chess, moveResult);

    return {
      move: chosenMove,
      sourceSquare: chosenMove.from,
      targetSquare: chosenMove.to,
      explanation,
      theme,
      scoreAdvantage: evaluation.score,
    };
  }
}

/**
 * Singleton instance of HintEngine.
 */
export const hintEngine = new HintEngine();
