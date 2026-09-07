import type { ChessScenario } from '@fun-chess/shared';

export const stalemateVsCheckmateScenario: ChessScenario = {
  id: 'stalemate-vs-checkmate',
  title: 'Checkmate vs. Stalemate: Win or Draw! ⚖️',
  subtitle: 'Learn the vital difference: In check + no moves = WIN! Not in check + no moves = DRAW!',
  category: 'checkmate_patterns',
  difficulty: 'beginner',
  targetAgeGroup: '7-10',
  icon: '⚖️',
  description: 'Checkmate is a victory (the enemy King is in check and cannot escape). Stalemate is an accidental draw (the enemy King is NOT in check, but has zero legal moves)! Always deliver check when sealing the win!',
  estimatedMinutes: 3,
  steps: [
    {
      id: 'stale-step-1',
      stepNumber: 1,
      instruction: 'Black’s King is trapped on a8! Don’t play Qb6 (which causes Stalemate)! Move your Queen from d6 to a6 to deliver CHECKMATE!',
      conceptExplanation: 'Checkmate requires a direct CHECK! If you trap the enemy King on a8 without checking it (like Qb6), the game ends immediately in an accidental Stalemate draw!',
      hint: 'Move your Queen from d6 along the diagonal to a6 with check.',
      setupFen: 'k7/2K5/3Q4/8/8/8/8/8 w - - 0 1',
      highlightSquares: ['d6', 'a6'],
      threatSquares: ['a8'],
      playerColor: 'w',
      allowedMoves: [
        { from: 'd6', to: 'a6' },
      ],
      explanationOnSuccess: 'Checkmate! 🏆 You gave check with Queen on a6, winning the game cleanly without causing a stalemate!',
    },
    {
      id: 'stale-step-2',
      stepNumber: 2,
      instruction: 'The Black King is trapped in the corner on h8. Avoid Qg6 (Stalemate)! Push your Queen up to g7 for the "Kiss of Death" CHECKMATE!',
      conceptExplanation: 'Remember: Checkmate is when the King is attacked and doomed. If the King is not attacked, it is Stalemate! Always check when finishing the game!',
      hint: 'Slide your Queen from g1 straight up the g-file to g7.',
      setupFen: '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1',
      highlightSquares: ['g1', 'g7'],
      threatSquares: ['h8'],
      playerColor: 'w',
      allowedMoves: [{ from: 'g1', to: 'g7' }],
      explanationOnSuccess: 'Brilliant checkmate! You delivered the winning blow and avoided the stalemate trap!',
    },
  ],
};
