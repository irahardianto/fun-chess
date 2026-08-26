import type { ChessScenario } from '@fun-chess/shared';

export const castlingSafetyScenario: ChessScenario = {
  id: 'castling-safety',
  title: 'Castling: King & Castle Fortress! 🏰',
  subtitle: 'Tuck your King safely away and activate your Rook in one single move!',
  category: 'special_moves',
  difficulty: 'beginner',
  targetAgeGroup: '7-10',
  icon: '🏰',
  description: 'Castling is the only move in chess where two pieces move together at the same time!',
  estimatedMinutes: 3,
  steps: [
    {
      id: 'castle-step-1',
      stepNumber: 1,
      instruction: 'Castle Kingside! Move your King from e1 two squares right to g1.',
      conceptExplanation: 'When castling Kingside (O-O), the King hops two squares toward the Rook, and the Rook leaps over to f1!',
      hint: 'Select the White King on e1 and move it to g1.',
      setupFen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5',
      highlightSquares: ['e1', 'g1'],
      playerColor: 'w',
      allowedMoves: [{ from: 'e1', to: 'g1' }],
      explanationOnSuccess: 'Fortress locked! Your King is snug behind pawns, and your Rook is ready for battle!',
    },
    {
      id: 'castle-step-2',
      stepNumber: 2,
      instruction: 'Now try Queenside Castling (Long Castle)! Move your King from e1 two squares left to c1.',
      conceptExplanation: 'Queenside castling (O-O-O) moves the King two squares left to c1, and the Rook hops to d1.',
      hint: 'Select the King on e1 and move it to c1.',
      setupFen: 'r3k2r/ppp1bppp/2np1n2/4p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 4 8',
      highlightSquares: ['e1', 'c1'],
      playerColor: 'w',
      allowedMoves: [{ from: 'e1', to: 'c1' }],
      explanationOnSuccess: 'Grand Castle! Long castling activated both your King’s defense and your Queen’s Rook!',
    },
  ],
};
