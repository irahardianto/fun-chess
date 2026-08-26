import type { MascotPersona } from '@fun-chess/shared';

/**
 * Grandmaster Owl — Level 4: Master / Club (~1700 ELO)
 * A wise master with solid positional play, classical principles, and deep endgame technique.
 */
export const grandmasterOwl: MascotPersona = {
  id: 'owl',
  name: 'Grandmaster Owl',
  avatar: '🦉',
  title: 'Wise Master',
  eloEstimate: 1700,
  difficulty: 'club',
  description: 'Deep positional wisdom, solid piece harmony, and relentless endgame precision. A true scholarly challenge for aspiring grandmasters!',
  themeColor: 'hsl(245, 78%, 58%)',
  dialogues: {
    game_start: [
      "Welcome! A splendid day for chess. Hoo-hoo! 🦉",
      "Chess is the gymnasium of the mind. Let us begin! 🎓",
      "Every piece has a purpose. Show me your strategy! 📜",
      "From the first pawn push to the endgame, play with honor! ✨",
    ],
    player_move: [
      "Sound move. Now assess the structure. 🦉",
      "A principled idea. Controlling key squares is paramount.",
      "Thoughtful development, young student! Hoo! 📜",
      "You calculate deeply. Let me examine the position. ⏳",
    ],
    ai_move: [
      "Harmonizing my pieces according to classical principles. 🦉",
      "Solidifying central control and king safety.",
      "Patience and position over hasty attacks. Hoo-hoo! ⏳",
      "A strategic repositioning to exert long-term pressure. 🎓",
    ],
    player_check: [
      "Admirable check. Let me calculate. 🦉",
      "A precise tactical check! My King finds safe harbor.",
      "Well calculated. Defending calmly. 🛡️",
      "A noble offensive thrust. My defenses remain intact.",
    ],
    ai_check: [
      "Check. Precision defense is required. 👑",
      "Check! Examine all three defenses: capture, block, or move. 🦉",
      "Check. The owl strikes with quiet accuracy. 🎯",
      "Check. Test your king's fortification! 🏰",
    ],
    player_blunder: [
      "An inaccuracy in piece coordination. Study this square. 🦉",
      "A positional weakness has appeared. I shall exploit it.",
      "Remember: always look for what your opponent is attacking. 🔍",
      "A learning moment: maintain balance across all files.",
    ],
    ai_blunder: [
      "A slight inaccuracy on my part. Well noticed! 🦉",
      "Even masters learn from every move. Fine observation! 🎓",
      "An unexpected defense! My calculation was slightly off.",
      "A splendid refutation of my maneuver! Kudos! 👏",
    ],
    player_win: [
      "Magnificent victory! You played like a true Grandmaster! 🏆🎓",
      "Splendid endgame technique! My highest compliments! 🦉🎉",
      "Hoo-hoo! A brilliant game! You have learned well! 🌟",
      "Checkmate! Your tactical vision was flawless today! 👑",
    ],
    ai_win: [
      "A well-fought contest. Review the opening and try again! 🦉",
      "Checkmate. You showed great promise in that middle game! 🎓",
      "Knowledge comes from every match. Rematch, student? 🔄",
      "Good effort! Study your piece activity and return stronger! 📜",
    ],
    draw: [
      "A scholarly draw. Deep positional equality achieved! 🦉🤝",
      "Perfection on both sides. A truly honorable result! 📜",
      "Neither side could claim an edge. Splendid precision! ⚖️",
      "A masterpiece of equilibrium! Well played, student.",
    ],
    hint_requested: [
      "A profound positional suggestion. Hoo-hoo! 💡",
      "Notice how this move improves your piece activity. 🦉",
      "A classical principle in action! Play with confidence! 🎓",
      "Grandmaster wisdom recommends this square! ✨",
    ],
    takeback_used: [
      "Reflection is the heart of mastery. Try your alternative! 🔄",
      "A wise learner re-evaluates mistakes. Take your time! 🦉",
      "Rewound. Search for the strongest candidate move. 📜",
      "Ponder the board anew and find the golden move! 🎓",
    ],
  },
};
