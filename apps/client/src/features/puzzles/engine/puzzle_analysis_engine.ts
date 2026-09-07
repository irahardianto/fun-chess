import { Chess, type Move } from 'chess.js';
import type {
  Square,
  PieceColor,
  PieceType,
  Puzzle,
  PuzzleTheme,
  PlayerMoveAction,
  MaterialAdvantageSummary,
  PuzzleAnalysisResult,
  PlayerMistakeRefutation,
  PuzzleStepExplanation,
  PuzzleAnalysisEngineService,
} from '@fun-chess/shared';
import {
  parseUciMove,
  formatPlayerMoveToUci,
} from '@fun-chess/shared';

/**
 * Centipawn values for chess pieces.
 */
export const PIECE_CENTIPAWN_VALUES: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export const PIECE_VALUES = PIECE_CENTIPAWN_VALUES;

/**
 * Standard point scale for chess pieces (+9, +5, +3, +1).
 */
export const PIECE_STANDARD_POINTS: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

/**
 * Human-readable piece display names.
 */
export const PIECE_DISPLAY_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

/**
 * Kid-friendly rules of thumb for core tactical themes.
 */
export const THEME_RULES_OF_THUMB: Record<string, string> = {
  fork: 'Knights and Queens are master forkers! Look for undefended pieces sharing the same diagonal or L-hop.',
  pin: 'When a piece is pinned, it cannot move without losing something bigger! Attack pinned pieces again!',
  skewer: 'Force the big piece to step aside and win what lies behind it!',
  discovered_attack: 'Move one piece to create a threat while unleashing another behind it!',
  discovered_check: 'When you uncover a check, the opponent must answer the King, letting your moving piece strike freely!',
  double_check: 'In double check, the King MUST move—no blocking or capturing can save it!',
  back_rank_mate: 'Watch the back rank! If pawns trap the King, a single Rook or Queen can deliver checkmate.',
  smothered_mate: 'When a King is surrounded by its own army, the Knight can jump in for an inescapable checkmate!',
  hanging_piece: 'Always count attackers and defenders! Free pieces are gifts you should take.',
  trapped_piece: 'Cut off all retreat squares to surround and win trapped enemy pieces.',
  greek_gift: 'Sacrificing the Bishop on h7 tears open the King\'s castle for a decisive attack!',
  windmill: 'Alternating discovered checks lets you harvest enemy pieces one after another like a windmill!',
  zwischenzug: 'Look for a surprise in-between move before making the expected capture!',
  deflection: 'Lure key defenders away from their critical posts!',
  decoy: 'Entice the enemy King or Queen onto a fatal square!',
  pawn_endgame: 'Passed pawns must be pushed! Create a Queen and convert the win.',
  mate_in_1: 'Look for checkmate in one single decisive blow!',
  mate_in_2: 'Calculate checks, captures, and threats to force checkmate in two moves!',
  mate_in_3: 'Chain forcing moves together to weave an inescapable checkmate net!',
};

/**
 * Counts total centipawn material on board for a specific color (excluding king).
 */
export function calculateColorMaterial(fen: string, color: PieceColor): number {
  try {
    const chess = new Chess(fen);
    const board = chess.board();
    let total = 0;
    for (let r = 0; r < 8; r++) {
      const row = board[r];
      if (!row) continue;
      for (let c = 0; c < 8; c++) {
        const piece = row[c];
        if (piece && piece.color === color && piece.type !== 'k') {
          total += PIECE_CENTIPAWN_VALUES[piece.type as PieceType] ?? 0;
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Counts piece occurrences for a given color.
 */
export function getPieceCounts(fen: string, color: PieceColor): Record<PieceType, number> {
  const counts: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  try {
    const chess = new Chess(fen);
    for (const row of chess.board()) {
      for (const p of row) {
        if (p && p.color === color) {
          counts[p.type as PieceType]++;
        }
      }
    }
  } catch {
    // Ignore error and return zeroes
  }
  return counts;
}

/**
 * Counts total centipawn material on board for white and black (excluding kings).
 */
export function getMaterialCount(chess: Chess): { white: number; black: number; net: number } {
  const board = chess.board();
  let white = 0;
  let black = 0;

  for (let r = 0; r < 8; r++) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < 8; c++) {
      const piece = row[c];
      if (piece && piece.type !== 'k') {
        const val = PIECE_CENTIPAWN_VALUES[piece.type as PieceType] ?? 0;
        if (piece.color === 'w') {
          white += val;
        } else {
          black += val;
        }
      }
    }
  }

  return {
    white,
    black,
    net: white - black,
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

  let chessInit: Chess;
  let chessFinal: Chess;
  try {
    chessInit = new Chess(initialFen);
    chessFinal = new Chess(finalFen);
  } catch {
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

  // Identify piece captured or promoted by comparing counts of opponent pieces
  const oppColor: PieceColor = playerColor === 'w' ? 'b' : 'w';
  let capturedPiece: PieceType | undefined;

  const countPieces = (ch: Chess, col: PieceColor): Record<PieceType, number> => {
    const counts: Record<PieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    for (const row of ch.board()) {
      for (const p of row) {
        if (p && p.color === col) {
          counts[p.type as PieceType]++;
        }
      }
    }
    return counts;
  };

  const oppInitCounts = countPieces(chessInit, oppColor);
  const oppFinalCounts = countPieces(chessFinal, oppColor);

  const pieceOrder: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
  for (const pt of pieceOrder) {
    if (oppFinalCounts[pt] < oppInitCounts[pt]) {
      capturedPiece = pt;
      break;
    }
  }

  // Format advantage string and net points per contract
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
 * Returns list of squares attacked by a piece of given type and color on a given square.
 */
export function getSquaresAttackedByPiece(
  board: ({ type: string; color: string } | null)[][],
  square: Square,
  pieceType: PieceType,
  color: PieceColor,
): Square[] {
  const file = square.charCodeAt(0) - 97; // 0..7 for a..h
  const rank = parseInt(square.charAt(1), 10) - 1; // 0..7 for 1..8
  const rIdx = 7 - rank; // 0..7 in board array (0 is rank 8)
  const cIdx = file;

  const attacked: Square[] = [];
  const coordsToSquare = (r: number, c: number): Square => {
    const fChar = String.fromCharCode(97 + c);
    const rNum = 8 - r;
    return `${fChar}${rNum}` as Square;
  };

  if (pieceType === 'p') {
    const dir = color === 'w' ? -1 : 1;
    const targetR = rIdx + dir;
    if (targetR >= 0 && targetR <= 7) {
      if (cIdx - 1 >= 0) attacked.push(coordsToSquare(targetR, cIdx - 1));
      if (cIdx + 1 <= 7) attacked.push(coordsToSquare(targetR, cIdx + 1));
    }
    return attacked;
  }

  if (pieceType === 'n') {
    const knightHops = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of knightHops) {
      const nr = rIdx + dr;
      const nc = cIdx + dc;
      if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
        attacked.push(coordsToSquare(nr, nc));
      }
    }
    return attacked;
  }

  if (pieceType === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = rIdx + dr;
        const nc = cIdx + dc;
        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
          attacked.push(coordsToSquare(nr, nc));
        }
      }
    }
    return attacked;
  }

  // Sliding pieces: B, R, Q
  const rays: [number, number][] = [];
  if (pieceType === 'b' || pieceType === 'q') {
    rays.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }
  if (pieceType === 'r' || pieceType === 'q') {
    rays.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }

  for (const [dr, dc] of rays) {
    let nr = rIdx + dr;
    let nc = cIdx + dc;
    while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
      attacked.push(coordsToSquare(nr, nc));
      if (board[nr]?.[nc] !== null) {
        break; // Ray blocked by piece
      }
      nr += dr;
      nc += dc;
    }
  }

  return attacked;
}

/**
 * Classifies the primary tactical motif executed in a move or sequence.
 */
export function classifyTacticalMotif(
  fenBefore: string,
  moveUci: string,
  fenAfter: string,
): {
  readonly theme: PuzzleTheme;
  readonly confidence: number;
  readonly explanation: string;
} {
  let chessBefore: Chess;
  let chessAfter: Chess;
  try {
    chessBefore = new Chess(fenBefore);
    chessAfter = new Chess(fenAfter);
  } catch {
    return {
      theme: 'fork',
      confidence: 0.5,
      explanation: 'Tactical move executed.',
    };
  }

  const { from, to, promotion } = parseUciMove(moveUci);
  const moverColor = chessBefore.turn();
  const oppColor: PieceColor = moverColor === 'w' ? 'b' : 'w';
  const movingPiece = chessBefore.get(from as unknown as import('chess.js').Square);
  const pieceType = (promotion ? 'q' : movingPiece?.type ?? 'p') as PieceType;

  // 1. Checkmate
  if (chessAfter.isCheckmate()) {
    // Check if smothered mate
    if (pieceType === 'n') {
      return {
        theme: 'smothered_mate',
        confidence: 0.95,
        explanation: 'Smothered mate! The King is trapped by its own pieces.',
      };
    }
    // Check if back rank mate
    const kingRank = oppColor === 'b' ? '8' : '1';
    if (to.charAt(1) === kingRank && (pieceType === 'r' || pieceType === 'q')) {
      return {
        theme: 'back_rank_mate',
        confidence: 0.95,
        explanation: 'Back rank mate! The trapped King had no escape squares.',
      };
    }
    return {
      theme: 'mate_in_1',
      confidence: 0.95,
      explanation: 'Checkmate! The enemy King is defeated.',
    };
  }

  // 2. Discovered Check / Double Check
  if (chessAfter.inCheck()) {
    const boardAfter = chessAfter.board();
    let attackersCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = boardAfter[r]?.[c];
        if (p && p.color === moverColor) {
          const fChar = String.fromCharCode(97 + c);
          const sq = `${fChar}${8 - r}` as Square;
          const attacks = getSquaresAttackedByPiece(boardAfter, sq, p.type as PieceType, moverColor);
          const kingSq = findKingSquare(boardAfter, oppColor);
          if (kingSq && attacks.includes(kingSq)) {
            attackersCount++;
          }
        }
      }
    }

    if (attackersCount >= 2) {
      return {
        theme: 'double_check',
        confidence: 0.95,
        explanation: 'Double check! Two pieces attack the King simultaneously.',
      };
    }

    const kingSq = findKingSquare(boardAfter, oppColor);
    const destAttacks = getSquaresAttackedByPiece(boardAfter, to, pieceType, moverColor);
    if (kingSq && !destAttacks.includes(kingSq)) {
      return {
        theme: 'discovered_check',
        confidence: 0.90,
        explanation: 'Discovered check! Moving uncovered an attack on the enemy King.',
      };
    }
  }

  // 3. Pawn Promotion
  if (promotion || (pieceType === 'p' && (to.charAt(1) === '8' || to.charAt(1) === '1'))) {
    return {
      theme: 'pawn_endgame',
      confidence: 0.85,
      explanation: 'Pawn promotion to Queen creates a dominant material advantage.',
    };
  }

  // 4. Fork / Double Attack
  const boardAfter = chessAfter.board();
  const attackedSquares = getSquaresAttackedByPiece(boardAfter, to, pieceType, moverColor);
  const attackedHighPieces: { type: PieceType; square: Square }[] = [];

  for (const sq of attackedSquares) {
    const file = sq.charCodeAt(0) - 97;
    const rank = parseInt(sq.charAt(1), 10) - 1;
    const targetPiece = boardAfter[7 - rank]?.[file];
    if (targetPiece && targetPiece.color === oppColor) {
      if (targetPiece.type === 'k' || targetPiece.type === 'q' || targetPiece.type === 'r' || targetPiece.type === 'b' || targetPiece.type === 'n') {
        attackedHighPieces.push({ type: targetPiece.type as PieceType, square: sq });
      }
    }
  }

  if (attackedHighPieces.length >= 2) {
    return {
      theme: 'fork',
      confidence: 0.90,
      explanation: `Fork! The ${PIECE_DISPLAY_NAMES[pieceType]} attacks multiple high-value pieces simultaneously.`,
    };
  }

  // 5. Pin / Skewer Detection (along rays from destination)
  if (pieceType === 'b' || pieceType === 'r' || pieceType === 'q') {
    const pinOrSkewer = detectPinOrSkewer(boardAfter, to, pieceType, moverColor, oppColor);
    if (pinOrSkewer) {
      return pinOrSkewer;
    }
  }

  // 6. Greek Gift Check
  if (pieceType === 'b' && (to === 'h7' || to === 'h2') && movingPiece?.type === 'b') {
    return {
      theme: 'greek_gift',
      confidence: 0.90,
      explanation: 'Greek Gift sacrifice! Tearing open the enemy King\'s fortress.',
    };
  }

  return {
    theme: 'hanging_piece',
    confidence: 0.70,
    explanation: 'Tactical strike winning material.',
  };
}

function findKingSquare(board: ({ type: string; color: string } | null)[][], color: PieceColor): Square | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r]?.[c];
      if (p && p.type === 'k' && p.color === color) {
        const fChar = String.fromCharCode(97 + c);
        return `${fChar}${8 - r}` as Square;
      }
    }
  }
  return null;
}

function detectPinOrSkewer(
  board: ({ type: string; color: string } | null)[][],
  square: Square,
  pieceType: PieceType,
  _moverColor: PieceColor,
  oppColor: PieceColor,
): { theme: PuzzleTheme; confidence: number; explanation: string } | null {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square.charAt(1), 10) - 1;
  const rIdx = 7 - rank;
  const cIdx = file;

  const rays: [number, number][] = [];
  if (pieceType === 'b' || pieceType === 'q') {
    rays.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }
  if (pieceType === 'r' || pieceType === 'q') {
    rays.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }

  for (const [dr, dc] of rays) {
    let nr = rIdx + dr;
    let nc = cIdx + dc;
    let firstPiece: { type: PieceType; color: PieceColor } | null = null;
    let secondPiece: { type: PieceType; color: PieceColor } | null = null;

    while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
      const p = board[nr]?.[nc];
      if (p) {
        if (!firstPiece) {
          firstPiece = { type: p.type as PieceType, color: p.color as PieceColor };
        } else if (!secondPiece) {
          secondPiece = { type: p.type as PieceType, color: p.color as PieceColor };
          break;
        }
      }
      nr += dr;
      nc += dc;
    }

    if (firstPiece && secondPiece && firstPiece.color === oppColor && secondPiece.color === oppColor) {
      const val1 = PIECE_CENTIPAWN_VALUES[firstPiece.type];
      const val2 = PIECE_CENTIPAWN_VALUES[secondPiece.type];

      if (secondPiece.type === 'k' || val2 > val1) {
        return {
          theme: 'pin',
          confidence: 0.88,
          explanation: `Pin! The ${PIECE_DISPLAY_NAMES[firstPiece.type]} is pinned against a higher-value target.`,
        };
      } else if (firstPiece.type === 'k' || val1 > val2) {
        return {
          theme: 'skewer',
          confidence: 0.88,
          explanation: `Skewer! The ${PIECE_DISPLAY_NAMES[firstPiece.type]} is forced to move, exposing the piece behind it.`,
        };
      }
    }
  }

  return null;
}

/**
 * Generates a constructive refutation when a player attempts an incorrect move.
 * Evaluates opponent's punishing response in <15ms using local search.
 */
export function generateMistakeRefutation(
  fen: string,
  playerMove: PlayerMoveAction,
  _depth = 1,
): PlayerMistakeRefutation | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }

  const playerColor = chess.turn();
  const playerUci = formatPlayerMoveToUci(playerMove);
  let playerResult: Move | null = null;
  try {
    playerResult = chess.move({
      from: playerMove.from as unknown as import('chess.js').Square,
      to: playerMove.to as unknown as import('chess.js').Square,
      promotion: playerMove.promotion,
    });
  } catch {
    return null;
  }

  if (!playerResult) return null;

  const playerMoveSan = playerResult.san;
  const oppColor: PieceColor = playerColor === 'w' ? 'b' : 'w';
  const oppColorName = oppColor === 'w' ? 'White' : 'Black';
  const oppMoves = chess.moves({ verbose: true });

  if (oppMoves.length === 0) return null;

  // Priority 1: Checkmate
  for (const m of oppMoves) {
    const copy = new Chess(chess.fen());
    copy.move(m);
    if (copy.isCheckmate()) {
      const refUci = `${m.from}${m.to}${m.promotion ?? ''}`;
      return {
        playerMoveUci: playerUci,
        playerMoveSan,
        refutationMoveUci: refUci,
        refutationMoveSan: m.san,
        punishingActor: oppColor,
        blunderReason: 'Allows immediate checkmate!',
        kidFriendlyExplanation: `Watch out! That move allows ${oppColorName} to deliver checkmate with ${m.san}! ⚠️`,
        threatSquare: m.to as Square,
      };
    }
  }

  // Priority 2: High-value capture
  const captures = oppMoves
    .filter((m) => Boolean(m.captured))
    .sort((a, b) => {
      const valA = PIECE_CENTIPAWN_VALUES[(a.captured ?? 'p') as PieceType] ?? 0;
      const valB = PIECE_CENTIPAWN_VALUES[(b.captured ?? 'p') as PieceType] ?? 0;
      return valB - valA;
    });

  if (captures.length > 0 && captures[0]) {
    const bestCap = captures[0];
    const refUci = `${bestCap.from}${bestCap.to}${bestCap.promotion ?? ''}`;
    const capPieceType = bestCap.captured as PieceType;
    const capName = PIECE_DISPLAY_NAMES[capPieceType] ?? 'piece';

    return {
      playerMoveUci: playerUci,
      playerMoveSan,
      refutationMoveUci: refUci,
      refutationMoveSan: bestCap.san,
      punishingActor: oppColor,
      capturedPiece: capPieceType,
      blunderReason: `Leaves your ${capName} on ${bestCap.to} unprotected.`,
      kidFriendlyExplanation: `Look out! That leaves your ${capName} on ${bestCap.to} open to capture by ${bestCap.san}.`,
      threatSquare: bestCap.to as Square,
    };
  }

  // Priority 3: Checking counter-move
  const checks = oppMoves.filter((m) => m.san.includes('+'));
  if (checks.length > 0 && checks[0]) {
    const bestCheck = checks[0];
    const refUci = `${bestCheck.from}${bestCheck.to}${bestCheck.promotion ?? ''}`;
    return {
      playerMoveUci: playerUci,
      playerMoveSan,
      refutationMoveUci: refUci,
      refutationMoveSan: bestCheck.san,
      punishingActor: oppColor,
      blunderReason: 'Allows opponent to counter-attack with check.',
      kidFriendlyExplanation: `That allows ${oppColorName} to counter-attack with ${bestCheck.san}. Look for a more forcing move! 💡`,
      threatSquare: bestCheck.to as Square,
    };
  }

  // Priority 4: Default defensive escape
  const defaultReply = oppMoves[0]!;
  const refUci = `${defaultReply.from}${defaultReply.to}${defaultReply.promotion ?? ''}`;
  return {
    playerMoveUci: playerUci,
    playerMoveSan,
    refutationMoveUci: refUci,
    refutationMoveSan: defaultReply.san,
    punishingActor: oppColor,
    blunderReason: 'Allows the opponent to defend and escape the tactic.',
    kidFriendlyExplanation: `That move lets ${oppColorName} defend with ${defaultReply.san}. Look for a sharper tactic! 💡`,
    threatSquare: defaultReply.to as Square,
  };
}

/**
 * Generates turn-by-turn explanations for every ply in the solution.
 */
export function generateStepBreakdowns(puzzle: Puzzle): readonly PuzzleStepExplanation[] {
  if (!puzzle || !puzzle.moves || puzzle.moves.length === 0) return [];

  const breakdowns: PuzzleStepExplanation[] = [];
  let chess: Chess;
  try {
    chess = new Chess(puzzle.fen);
  } catch {
    return [];
  }

  for (let i = 0; i < puzzle.moves.length; i++) {
    const moveUci = puzzle.moves[i]!;
    const actor: PieceColor = chess.turn();
    const isPlayer = actor === puzzle.playerColor;
    const { from, to, promotion } = parseUciMove(moveUci);
    const movingPiece = chess.get(from as unknown as import('chess.js').Square);
    const pieceName = movingPiece ? PIECE_DISPLAY_NAMES[movingPiece.type as PieceType] : 'Piece';

    let moveRes: Move | null = null;
    try {
      moveRes = chess.move({
        from: from as unknown as import('chess.js').Square,
        to: to as unknown as import('chess.js').Square,
        promotion,
      });
    } catch {
      moveRes = null;
    }

    const moveSan = moveRes ? moveRes.san : moveUci;

    // Use predefined explanation if present
    if (puzzle.stepExplanations?.[i]?.explanation) {
      breakdowns.push({
        plyIndex: i,
        moveSan,
        moveUci,
        actor,
        explanation: puzzle.stepExplanations[i]!.explanation,
      });
      continue;
    }

    // Synthesize explanation
    let explanation = '';
    if (chess.isCheckmate()) {
      explanation = isPlayer
        ? `You play ${moveSan}, delivering checkmate! 👑`
        : `Opponent plays ${moveSan}, delivering checkmate!`;
    } else if (moveSan.includes('+')) {
      explanation = isPlayer
        ? `You play ${moveSan} with your ${pieceName}, checking the enemy King!`
        : `Opponent must respond to the check with ${moveSan}.`;
    } else if (moveRes?.captured) {
      const capName = PIECE_DISPLAY_NAMES[moveRes.captured as PieceType] ?? 'piece';
      explanation = isPlayer
        ? `You capture the ${capName} on ${to} with ${moveSan}!`
        : `Opponent captures on ${to} with ${moveSan}.`;
    } else if (promotion) {
      explanation = isPlayer
        ? `You promote the pawn to a Queen on ${to} (${moveSan})! 👑`
        : `Opponent promotes with ${moveSan}.`;
    } else {
      explanation = isPlayer
        ? `You play ${moveSan} to execute the tactical plan.`
        : `Opponent responds with ${moveSan}.`;
    }

    breakdowns.push({
      plyIndex: i,
      moveSan,
      moveUci,
      actor,
      explanation,
    });
  }

  return breakdowns;
}

/**
 * Synthesizes kid-friendly 1-2 sentence explanation of why a tactic worked.
 */
export function generateKidExplanation(puzzle: Puzzle, analysis: PuzzleAnalysisResult): string {
  if (puzzle.learningSummary && puzzle.learningSummary.trim().length > 0) {
    return puzzle.learningSummary;
  }

  if (analysis.isCheckmate) {
    return 'Checkmate! By coordinating your pieces, you left the enemy King with no escape squares! 👑';
  }

  switch (analysis.detectedTheme) {
    case 'fork':
      return `Brilliant fork! Landing on the key square attacked two targets simultaneously, winning ${analysis.advantageSummary.formattedAdvantage}!`;
    case 'pin':
      return `Masterful pin! The pinned piece was paralyzed, winning ${analysis.advantageSummary.formattedAdvantage}!`;
    case 'skewer':
      return `Powerful skewer! Forcing the enemy piece to move won ${analysis.advantageSummary.formattedAdvantage} behind it!`;
    case 'discovered_check':
    case 'discovered_attack':
      return `Sneaky discovered attack! Uncovering the threat overwhelmed the opponent's defense to win ${analysis.advantageSummary.formattedAdvantage}!`;
    case 'back_rank_mate':
      return 'Back rank checkmate! The enemy pawns blocked their own King from escaping!';
    case 'smothered_mate':
      return 'Smothered mate! The Knight leaped over all defenders to deliver checkmate!';
    default:
      return `Great tactical vision! The combination won ${analysis.advantageSummary.formattedAdvantage}!`;
  }
}

/**
 * Generates a complete pedagogical analysis of a puzzle from initial FEN to final solution ply.
 */
export function analyzePuzzleSolution(puzzle: Puzzle): PuzzleAnalysisResult {
  let chessInit: Chess;
  let chessSim: Chess;
  try {
    chessInit = new Chess(puzzle.fen);
    chessSim = new Chess(puzzle.fen);
  } catch {
    const fallbackMat = { white: 0, black: 0, net: 0 };
    return {
      initialMaterial: fallbackMat,
      finalMaterial: fallbackMat,
      materialDeltaCentipawns: 0,
      netPointsDelta: 0,
      advantageSummary: {
        netCentipawns: 0,
        netPoints: 0,
        formattedAdvantage: 'Positional Advantage ⚡',
        isDecisive: false,
      },
      detectedTheme: puzzle.primaryTheme || 'fork',
      isCheckmate: false,
      isPawnPromotion: false,
      tacticalHeadline: puzzle.title || 'Tactical Solution',
      kidFriendlyExplanation: puzzle.learningSummary || 'Great tactical vision!',
      ruleOfThumb: puzzle.keyTakeaway || THEME_RULES_OF_THUMB[puzzle.primaryTheme] || 'Always look for forcing moves!',
      stepNarratives: [],
    };
  }

  const initialMaterial = getMaterialCount(chessInit);
  const stepNarratives = generateStepBreakdowns(puzzle);

  let isPawnPromo = false;
  for (const moveUci of puzzle.moves) {
    if (moveUci.length > 4) isPawnPromo = true;
    const { from, to, promotion } = parseUciMove(moveUci);
    try {
      chessSim.move({
        from: from as unknown as import('chess.js').Square,
        to: to as unknown as import('chess.js').Square,
        promotion,
      });
    } catch {
      // Continue simulation
    }
  }

  const finalMaterial = getMaterialCount(chessSim);
  const isCheckmate = chessSim.isCheckmate();
  const advantageSummary = calculateMaterialDelta(puzzle.fen, chessSim.fen(), puzzle.playerColor, isCheckmate);

  const initBal = puzzle.playerColor === 'w' ? initialMaterial.white - initialMaterial.black : initialMaterial.black - initialMaterial.white;
  const finalBal = puzzle.playerColor === 'w' ? finalMaterial.white - finalMaterial.black : finalMaterial.black - finalMaterial.white;
  const materialDeltaCentipawns = advantageSummary.netCentipawns === 10000 ? 10000 : finalBal - initBal;

  let detectedTheme = puzzle.primaryTheme;
  if (!detectedTheme && puzzle.moves[0]) {
    const classified = classifyTacticalMotif(puzzle.fen, puzzle.moves[0], chessSim.fen());
    detectedTheme = classified.theme;
  }

  const headline = puzzle.title || `${advantageSummary.formattedAdvantage} Tactical Win!`;
  const ruleOfThumb = puzzle.keyTakeaway || THEME_RULES_OF_THUMB[detectedTheme] || 'Look for checks, captures, and threats on every move!';

  const partialResult: PuzzleAnalysisResult = {
    initialMaterial,
    finalMaterial,
    materialDeltaCentipawns,
    netPointsDelta: advantageSummary.netPoints,
    advantageSummary,
    detectedTheme,
    isCheckmate,
    isPawnPromotion: isPawnPromo,
    tacticalHeadline: headline,
    kidFriendlyExplanation: '',
    ruleOfThumb,
    stepNarratives,
  };

  const kidExplanation = generateKidExplanation(puzzle, partialResult);

  return {
    ...partialResult,
    kidFriendlyExplanation: kidExplanation,
  };
}

/**
 * Concrete implementation of PuzzleAnalysisEngineService.
 */
export class PuzzleAnalysisEngine implements PuzzleAnalysisEngineService {
  analyzePuzzleSolution(puzzle: Puzzle): PuzzleAnalysisResult {
    return analyzePuzzleSolution(puzzle);
  }

  calculateMaterialDelta(
    initialFen: string,
    finalFen: string,
    playerColor: PieceColor,
  ): MaterialAdvantageSummary {
    return calculateMaterialDelta(initialFen, finalFen, playerColor);
  }

  classifyTacticalMotif(
    fenBefore: string,
    moveUci: string,
    fenAfter: string,
  ): {
    readonly theme: PuzzleTheme;
    readonly confidence: number;
    readonly explanation: string;
  } {
    return classifyTacticalMotif(fenBefore, moveUci, fenAfter);
  }

  generateMistakeRefutation(
    fen: string,
    playerMove: PlayerMoveAction,
    depth?: number,
  ): PlayerMistakeRefutation | null {
    return generateMistakeRefutation(fen, playerMove, depth);
  }

  generateKidExplanation(puzzle: Puzzle, analysis: PuzzleAnalysisResult): string {
    return generateKidExplanation(puzzle, analysis);
  }

  generateStepBreakdowns(puzzle: Puzzle): readonly PuzzleStepExplanation[] {
    return generateStepBreakdowns(puzzle);
  }
}

export const puzzleAnalysisEngine = new PuzzleAnalysisEngine();
