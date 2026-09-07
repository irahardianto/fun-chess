import type { ChessScenario } from '@fun-chess/shared';

export const boardCoordinatesScenario: ChessScenario = {
  id: 'board-coordinates',
  title: 'Board Coordinates: Files, Ranks & Squares! 🗺️',
  subtitle: 'Learn the secret map of the chessboard: letters across, numbers up!',
  category: 'fundamentals',
  difficulty: 'beginner',
  targetAgeGroup: '7-10',
  icon: '🗺️',
  description: 'Every square on the chessboard has its own address! Files are vertical columns (a-h) and Ranks are horizontal rows (1-8).',
  estimatedMinutes: 2,
  steps: [
    {
      id: 'coord-step-1',
      stepNumber: 1,
      instruction: 'Slide your Rook from the corner a1 square across Rank 1 over to the e1 square!',
      conceptExplanation: 'Vertical columns are called Files (labeled a to h) and horizontal rows are Ranks (numbered 1 to 8). e1 is File e, Rank 1!',
      hint: 'Slide your Rook from a1 sideways across the 1st rank to e1.',
      setupFen: '7k/8/8/8/8/8/8/R5K1 w - - 0 1',
      highlightSquares: ['a1', 'e1'],
      playerColor: 'w',
      allowedMoves: [{ from: 'a1', to: 'e1' }],
      explanationOnSuccess: 'Spot on! You navigated right to e1 on the board map!',
    },
    {
      id: 'coord-step-2',
      stepNumber: 2,
      instruction: 'Now march your Rook up the e-file from e1 to the center square e4!',
      conceptExplanation: 'Square names combine the file letter first, then the rank number: e + 4 = e4!',
      hint: 'Move your Rook from e1 straight up the e-file to e4.',
      setupFen: '7k/8/8/8/8/8/8/4R1K1 w - - 0 1',
      highlightSquares: ['e1', 'e4'],
      playerColor: 'w',
      allowedMoves: [{ from: 'e1', to: 'e4' }],
      explanationOnSuccess: 'Awesome! e4 is one of the four golden center squares in chess!',
    },
  ],
};
