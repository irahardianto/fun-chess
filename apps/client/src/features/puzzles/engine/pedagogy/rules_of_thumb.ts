import { Chess, type Move } from 'chess.js';
import type {
  Square,
  PieceColor,
  PieceType,
  Puzzle,
  PlayerMoveAction,
  PuzzleAnalysisResult,
  PlayerMistakeRefutation,
  PuzzleStepExplanation,
} from '@fun-chess/shared';
import {
  parseUciMove,
  formatPlayerMoveToUci,
  createSafeChess,
  isValidFen,
  PIECE_CENTIPAWN_VALUES,
} from '@fun-chess/shared';

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
 * Helper to check if any opponent move delivers immediate checkmate.
 */
export function findCheckmateRefutation(
  chess: Chess,
  oppMoves: Move[],
  playerUci: string,
  playerMoveSan: string,
  oppColor: PieceColor,
): PlayerMistakeRefutation | null {
  const oppColorName = oppColor === 'w' ? 'White' : 'Black';
  for (const m of oppMoves) {
    const copy = createSafeChess(chess.fen());
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
  return null;
}

/**
 * Helper to check if any opponent move captures high-value unprotected material.
 */
export function findCaptureRefutation(
  oppMoves: Move[],
  playerUci: string,
  playerMoveSan: string,
  oppColor: PieceColor,
): PlayerMistakeRefutation | null {
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
  return null;
}

/**
 * Helper to check if any opponent move delivers an aggressive counter-check.
 */
export function findCheckRefutation(
  oppMoves: Move[],
  playerUci: string,
  playerMoveSan: string,
  oppColor: PieceColor,
): PlayerMistakeRefutation | null {
  const oppColorName = oppColor === 'w' ? 'White' : 'Black';
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
  if (!isValidFen(fen)) return null;

  let chess: Chess;
  try {
    chess = createSafeChess(fen);
  } catch {
    return null;
  }

  const playerColor = chess.turn();
  const playerUci = formatPlayerMoveToUci(playerMove);
  let playerResult: Move | null;
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
  const mateRefutation = findCheckmateRefutation(chess, oppMoves, playerUci, playerMoveSan, oppColor);
  if (mateRefutation) return mateRefutation;

  // Priority 2: High-value capture
  const capRefutation = findCaptureRefutation(oppMoves, playerUci, playerMoveSan, oppColor);
  if (capRefutation) return capRefutation;

  // Priority 3: Checking counter-move
  const checkRefutation = findCheckRefutation(oppMoves, playerUci, playerMoveSan, oppColor);
  if (checkRefutation) return checkRefutation;

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
 * Synthesizes a natural language step narrative for a move in a puzzle solution.
 */
function synthesizeStepExplanation(
  chess: Chess,
  moveRes: Move | null,
  moveSan: string,
  to: string,
  promotion: string | undefined,
  isPlayer: boolean,
  pieceName: string,
): string {
  if (chess.isCheckmate()) {
    return isPlayer
      ? `You play ${moveSan}, delivering checkmate! 👑`
      : `Opponent plays ${moveSan}, delivering checkmate!`;
  }
  if (moveSan.includes('+')) {
    return isPlayer
      ? `You play ${moveSan} with your ${pieceName}, checking the enemy King!`
      : `Opponent must respond to the check with ${moveSan}.`;
  }
  if (moveRes?.captured) {
    const capName = PIECE_DISPLAY_NAMES[moveRes.captured as PieceType] ?? 'piece';
    return isPlayer
      ? `You capture the ${capName} on ${to} with ${moveSan}!`
      : `Opponent captures on ${to} with ${moveSan}.`;
  }
  if (promotion) {
    return isPlayer
      ? `You promote the pawn to a Queen on ${to} (${moveSan})! 👑`
      : `Opponent promotes with ${moveSan}.`;
  }
  return isPlayer
    ? `You play ${moveSan} to execute the tactical plan.`
    : `Opponent responds with ${moveSan}.`;
}

/**
 * Generates turn-by-turn explanations for every ply in the solution.
 */
export function generateStepBreakdowns(puzzle: Puzzle): readonly PuzzleStepExplanation[] {
  if (!puzzle || !puzzle.moves || puzzle.moves.length === 0 || !isValidFen(puzzle.fen)) return [];

  const breakdowns: PuzzleStepExplanation[] = [];
  let chess: Chess;
  try {
    chess = createSafeChess(puzzle.fen);
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

    let moveRes: Move | null;
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

    const explanation = synthesizeStepExplanation(
      chess,
      moveRes,
      moveSan,
      to,
      promotion,
      isPlayer,
      pieceName,
    );

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
